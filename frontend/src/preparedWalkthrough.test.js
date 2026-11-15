import { test } from "node:test";
import assert from "node:assert/strict";
import { capturePlan, sweepFingerprint, signatureData } from "./preparedWalkthrough.js";

const scans = [0, 1, 2, 3].map((n) => ({ sid: `scan-${n}`, uuid: `uuid-${n}`, enabled: true,
  position: { x: n * 3, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }));

test("preparation starts at the current scan and covers six directions at three locations", () => {
  const plan = capturePlan(scans, "uuid-1");
  assert.equal(plan.length, 18);
  assert.equal(plan[0].scanId, "scan-1");
  assert.equal(new Set(plan.map((item) => item.scanId)).size, 3);
  assert.deepEqual(plan.slice(0, 6).map((item) => item.rotation.y), [0, 60, 120, 180, 240, 300]);
});

test("fingerprints survive event ordering but change when scan geometry changes", async () => {
  const first = await sweepFingerprint(scans);
  assert.equal(first, await sweepFingerprint([...scans].reverse()));
  const changed = scans.map((scan, index) => index ? scan : { ...scan, position: { x: 10, y: 0, z: 0 } });
  assert.notEqual(first, await sweepFingerprint(changed));
  assert.equal(signatureData([...scans, { sid: "disabled", enabled: false }]).length, 4);
});

import { waitForPlaying, addBarrierTag } from "./preparedWalkthrough.js";

test("restoration waits for PLAYING, rather than SDK connect or the first scan event", async () => {
  let update, cancelled = 0, ready = false;
  const sdk = { App: { Phase: { PLAYING: "playing" }, state: { subscribe: (callback) => {
    update = callback; callback({ phase: "starting" }); return { cancel: () => cancelled++ };
  } } } };
  const waiting = waitForPlaying(sdk).then(() => { ready = true; });
  await Promise.resolve(); assert.equal(ready, false);
  update({ phase: "playing" }); await waiting;
  assert.equal(ready, true); assert.equal(cancelled, 1);
});

test("an immediately ready viewer releases the synchronous subscription", async () => {
  let cancelled = 0;
  await waitForPlaying({ App: { state: { subscribe: (callback) => {
    callback({ phase: "appphase.playing" }); return { cancel: () => cancelled++ };
  } } } });
  assert.equal(cancelled, 1);
});

test("a failed interaction preference does not delete a successfully created cached pin", async () => {
  const descriptors = [];
  const sdk = { Tag: { add: async (descriptor) => { descriptors.push(descriptor); return ["saved-tag"]; },
    allowAction: async () => { throw "setting is unavailable"; },
    remove: async () => { assert.fail("Must not delete an existing pin for an optional preference failure"); },
  } };
  const finding = { title: "Door handle", detail: "Possible grip issue", anchor: {
    position: { x: 1, y: 2, z: 3 }, cameraPosition: { x: 1, y: 2, z: 0 },
  } };
  assert.equal(await addBarrierTag(sdk, finding, "step-free", true), "saved-tag");
  assert.equal(descriptors[0].enabled, true);
  assert.equal(descriptors[0].opacity, 1);
  assert.deepEqual(descriptors[0].anchorPosition, finding.anchor.position);
});


test("cached markers allow the expanded View more panel while preventing camera jumps", async () => {
  let actions;
  const sdk = { Tag: {
    add: async () => ["tag"],
    allowAction: async (_id, settings) => { actions = settings; },
    dock: async () => { if (!actions.docking) throw new Error("Expanded panel disabled"); return "expanded"; },
  } };
  await addBarrierTag(sdk, { title: "Door", detail: "Possible access barrier", anchor: {
    position: { x: 1, y: 2, z: 3 }, cameraPosition: { x: 1, y: 2, z: 0 },
  } }, "step-free", true);
  assert.equal(await sdk.Tag.dock("tag"), "expanded");
  assert.equal(actions.opening, true);
  assert.equal(actions.navigating, false);
});
