import { test } from "node:test";
import assert from "node:assert/strict";
import { captureAnchor } from "./walkthroughAnchors.js";

test("captures the raycast surface and actual camera view, rather than photo coordinates", async () => {
  let received;
  const sdk = {
    Renderer: { getWorldPositionData: async (point) => {
      received = point; return { position: { x: 2.4, y: 1.2, z: -3 } };
    } },
    Camera: { getPose: async () => ({ sweep: "actual-scan", rotation: { x: -12, y: 81 } }) },
  };
  const anchor = await captureAnchor(sdk, { x: 420, y: 200 });
  assert.deepEqual(received, { x: 420, y: 200 });
  assert.deepEqual(anchor, { position: { x: 2.4, y: 1.2, z: -3 }, scanId: "actual-scan", rotation: { x: -12, y: 81 } });
});

test("refuses empty or invalid model intersections", async () => {
  for (const position of [null, { x: NaN, y: 0, z: 0 }]) {
    await assert.rejects(captureAnchor({ Renderer: { getWorldPositionData: async () => ({ position }) } }, { x: 0, y: 0 }), /No scanned surface/);
  }
});

test("refuses placement between scans or without a valid camera rotation", async () => {
  for (const pose of [{ sweep: "", rotation: { x: 0, y: 0 } }, { sweep: "scan", rotation: { x: 0 } }]) {
    const sdk = { Renderer: { getWorldPositionData: async () => ({ position: { x: 0, y: 0, z: 0 } }) }, Camera: { getPose: async () => pose } };
    await assert.rejects(captureAnchor(sdk, { x: 0, y: 0 }), /No current scan/);
  }
});

import { analyzeWalkthroughView, boxScreenPoint } from "./walkthroughAnchors.js";

test("scales normalized image coordinates to the iframe viewport", () => {
  assert.deepEqual(boxScreenPoint([100, 200, 300, 600], 1200, 800), { x: 480, y: 160 });
  assert.equal(boxScreenPoint([300, 200, 100, 600], 1200, 800), null);
});

function autoSdk() {
  const hits = [];
  const pose = { sweep: "scan", rotation: { x: 0, y: 20 } };
  return { hits, pose, Camera: { getPose: async () => pose }, Renderer: {
    takeScreenShot: async () => "data:image/jpg;base64,/9j/aW1hZ2U=",
    getWorldPositionData: async (point) => { hits.push(point); return { position: { x: 1, y: 2, z: 3 } }; },
  } };
}
const reviewResponse = async () => ({ ok: true, json: async () => ({ observations: [
  { title: "Obstacle", detail: "Possible blocked passage", box_2d: [100, 200, 300, 600], anchor_2d: [200, 400] },
  { title: "Unclear", detail: "No position", box_2d: [] },
] }) });

test("automatically captures, reviews, and anchors a finding without visitor input", async () => {
  const sdk = autoSdk();
  const result = await analyzeWalkthroughView({ sdk, width: 1200, height: 800, profile: "step-free", isCurrent: () => true, fetchReview: reviewResponse });
  assert.equal(result.localized.length, 1);
  assert.equal(result.unplaced.length, 1);
  assert.deepEqual(sdk.hits, [{ x: 480, y: 160 }]);
  assert.equal(result.localized[0].anchor.scanId, "scan");
});

test("discards delayed detections after the camera moves", async () => {
  const sdk = autoSdk();
  const result = await analyzeWalkthroughView({ sdk, width: 1200, height: 800, profile: "step-free", isCurrent: () => true,
    fetchReview: async () => { sdk.pose.rotation.y = 40; return reviewResponse(); } });
  assert.equal(result.stale, true);
  assert.equal(sdk.hits.length, 0);
});


import { screenshotPayload } from "./walkthroughAnchors.js";

test("accepts Matterport image/jpg and sends canonical JPEG MIME", () => {
  assert.deepEqual(screenshotPayload("data:image/jpg;base64,/9j/aW1hZ2U="), {
    mimeType: "image/jpeg", imageData: "/9j/aW1hZ2U=",
  });
});

test("accepts image parameters and wrapped base64, using image bytes", () => {
  assert.deepEqual(screenshotPayload("data:image/jpg;charset=utf-8;base64,/9j/\naW1hZ2U="), {
    mimeType: "image/jpeg", imageData: "/9j/aW1hZ2U=",
  });
});

test("rejects malformed and non-image screenshots before API submission", () => {
  for (const value of [null, {}, "blob:https://example.test/id", "data:image/jpeg;base64,%%%", "data:image/jpeg;base64,cGhvdG8="]) {
    assert.throws(() => screenshotPayload(value));
  }
});


import { anchorScreenPoint, resolveScanId, navigateToMarker } from "./walkthroughAnchors.js";

test("uses the barrier surface point rather than empty doorway box centre", () => {
  const finding = { box_2d: [100, 200, 900, 800], anchor_2d: [800, 220] };
  assert.deepEqual(anchorScreenPoint(finding, 1000, 500), { x: 220, y: 400 });
  assert.equal(anchorScreenPoint({ box_2d: finding.box_2d }, 1000, 500), null);
  assert.equal(anchorScreenPoint({ ...finding, anchor_2d: [0, 0] }, 1000, 500), null);
});

test("resolves Model API UUIDs against this tour and rejects unrelated IDs", () => {
  const sweeps = new Map([["current", { sid: "sdk-sid", uuid: "api-uuid", enabled: true }]]);
  assert.equal(resolveScanId("api-uuid", sweeps), "sdk-sid");
  assert.throws(() => resolveScanId("other-model-scan", sweeps));
});

test("marker navigation restores its own scan, rotation and zoom before opening the pin", async () => {
  const calls = [];
  const sdk = { Sweep: { moveTo: async (...args) => calls.push(["move", ...args]) },
    Camera: { zoomTo: async (zoom) => calls.push(["zoom", zoom]) },
    Tag: { open: async (id) => calls.push(["open", id]) } };
  const marker = { modelId: "clinic", tagId: "tag", anchor: { scanId: "uuid", rotation: { x: 3, y: 60 }, zoom: 2 } };
  const sweeps = new Map([["sid", { sid: "sid", uuid: "uuid" }]]);
  await navigateToMarker(sdk, marker, "clinic", sweeps);
  assert.deepEqual(calls, [["move", "sid", { rotation: { x: 3, y: 60 } }], ["zoom", 2], ["open", "tag"]]);
  calls.length = 0;
  await assert.rejects(navigateToMarker(sdk, marker, "other-clinic", sweeps), /different model/);
  assert.equal(calls.length, 0);
});

test("captures at native viewport size and rejects results after zoom changes", async () => {
  const sdk = autoSdk();
  let resolution, zoom = 1;
  sdk.Renderer.takeScreenShot = async (size) => { resolution = size; return "data:image/jpg;base64,/9j/aW1hZ2U="; };
  const result = await analyzeWalkthroughView({ sdk, width: 1600, height: 900, profile: "step-free", isCurrent: () => true,
    getZoom: () => zoom, fetchReview: async () => { zoom = 2; return reviewResponse(); } });
  assert.equal(resolution, undefined);
  assert.equal(result.stale, true);
  assert.equal(sdk.hits.length, 0);
});

test("retains detections as text when a hit does not project back to the chosen pixel", async () => {
  const sdk = autoSdk();
  sdk.Renderer.getScreenPosition = async () => ({ x: 10, y: 10 });
  const result = await analyzeWalkthroughView({ sdk, width: 1200, height: 800, profile: "step-free", isCurrent: () => true, fetchReview: reviewResponse });
  assert.equal(result.localized.length, 0);
  assert.equal(result.unplaced.length, 2);
});

import { markerStemVector, createReviewTracker } from "./walkthroughAnchors.js";

test("keeps a pin on its camera ray while lifting it slightly out of the mesh", () => {
  const stem = markerStemVector({ position: { x: 0, y: 0, z: 0 }, cameraPosition: { x: 3, y: 0, z: 4 } });
  assert.ok(Math.abs(Math.hypot(stem.x, stem.y, stem.z) - 0.015) < 1e-9);
  assert.equal(stem.y, 0);
  assert.ok(Math.abs(stem.x / stem.z - 3 / 4) < 1e-9);
});

test("failed and stale views can retry, completed views do not repeat", () => {
  const tracker = createReviewTracker();
  assert.equal(tracker.start("initial"), true);
  tracker.finish("initial", "failed");
  assert.equal(tracker.isComplete("initial"), false);
  assert.equal(tracker.start("initial"), true);
  tracker.finish("initial", "complete");
  assert.equal(tracker.canStart("initial"), false);
  assert.equal(tracker.start("second"), true);
  tracker.finish("second", "stale");
  assert.equal(tracker.canStart("second"), true);
  assert.deepEqual(tracker.counts(), { requests: 3, completed: 1 });
});

test("automatic retry and request limits prevent an endless request loop", () => {
  const tracker = createReviewTracker({ maxRequests: 3 });
  tracker.start("a"); tracker.finish("a", "failed");
  tracker.start("a"); tracker.finish("a", "failed");
  assert.equal(tracker.canStart("a"), false);
  tracker.start("b"); tracker.finish("b", "stale");
  assert.equal(tracker.exhausted(), true);
  assert.equal(tracker.canStart("c"), false);
});
