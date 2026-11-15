export function isVector(value) {
  return Boolean(value && [value.x, value.y, value.z].every(Number.isFinite));
}

export async function captureAnchor(sdk, screenPoint) {
  const hit = await sdk.Renderer.getWorldPositionData(screenPoint);
  if (!isVector(hit.position)) throw new Error("No scanned surface");
  const pose = await sdk.Camera.getPose();
  if (!pose.sweep || !Number.isFinite(pose.rotation?.x) || !Number.isFinite(pose.rotation?.y)) {
    throw new Error("No current scan");
  }
  return {
    position: { x: hit.position.x, y: hit.position.y, z: hit.position.z },
    scanId: pose.sweep,
    rotation: { x: pose.rotation.x, y: pose.rotation.y },
    ...(isVector(pose.position) ? { cameraPosition: { ...pose.position } } : {}),
  };
}

export function viewKey(pose, width, height) {
  if (!pose?.sweep || !pose.rotation) return "";
  return JSON.stringify([pose.sweep, Math.round(pose.rotation.x * 100), Math.round(pose.rotation.y * 100),
    pose.position ? [pose.position.x, pose.position.y, pose.position.z] : null,
    pose.projection ? Array.from(pose.projection, (value) => Math.round(value * 1e6)) : null, width, height]);
}

export function boxScreenPoint(box, width, height) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((value) => Number.isFinite(value) && value >= 0 && value <= 1000)
      || box[0] >= box[2] || box[1] >= box[3]) return null;
  return { x: (box[1] + box[3]) / 2000 * width, y: (box[0] + box[2]) / 2000 * height };
}

export function screenshotPayload(image) {
  // Renderer returns an image data URI. Some versions label JPEG as image/jpg;
  // determine the canonical MIME type from the bytes rather than the label.
  if (typeof image !== "string") throw new Error("The walkthrough returned an unsupported screenshot response.");
  const match = /^data:[^,]*;base64,([\s\S]+)$/i.exec(image.trim());
  if (!match) throw new Error("The walkthrough did not return an encoded image. Reload the tour and try again.");
  const imageData = match[1].replace(/\s/g, "");
  let bytes;
  try { bytes = atob(imageData); }
  catch { throw new Error("The walkthrough screenshot could not be decoded."); }
  let mimeType;
  if (bytes.startsWith("\xff\xd8\xff")) mimeType = "image/jpeg";
  else if (bytes.startsWith("\x89PNG\r\n\x1a\n")) mimeType = "image/png";
  else if (bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP") mimeType = "image/webp";
  else throw new Error("The walkthrough returned an empty or unsupported image. Reload the tour and try again.");
  return { mimeType, imageData };
}

export async function analyzeWalkthroughView({ sdk, width, height, profile, signal, isCurrent, getZoom = () => 1, onStage = () => {}, fetchReview = fetch }) {
  const started = performance.now();
  onStage("capture");
  const startPose = await sdk.Camera.getPose();
  const expected = viewKey(startPose, width, height);
  const zoom = getZoom();
  const unchanged = async () => isCurrent() && getZoom() === zoom && viewKey(await sdk.Camera.getPose(), width, height) === expected;
  // Native viewport capture preserves the exact camera projection used by raycasts.
  const image = await sdk.Renderer.takeScreenShot(undefined,
    { mattertags: false, measurements: false, sweeps: false, views: false });
  if (!await unchanged()) return { stale: true };
  const screenshot = screenshotPayload(image);
  const captured = performance.now();
  onStage("review");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 45000);
  let review;
  try {
    const response = await fetchReview("/api/walkthrough-review", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ building: "Current clinic walkthrough view", profile, ...screenshot }),
    });
    review = await response.json();
    if (!response.ok) throw new Error(review.error || "Automatic barrier review failed.");
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
  if (!await unchanged()) return { stale: true };
  const reviewed = performance.now();
  onStage("placement");
  const localized = [], unplaced = [];
  for (const finding of (review.observations || []).slice(0, 4)) {
    const point = anchorScreenPoint(finding, width, height);
    if (!point) { unplaced.push({ ...finding, placementReason: "The image review did not identify a reliable surface point." }); continue; }
    try {
      if (!await unchanged()) return { stale: true };
      const anchor = await captureAnchor(sdk, point);
      if (!await unchanged()) return { stale: true };
      if (sdk.Renderer.getScreenPosition) {
        const projected = await sdk.Renderer.getScreenPosition(anchor.position);
        if (!projected || Math.hypot(projected.x - point.x, projected.y - point.y) > 6) {
          unplaced.push({ ...finding, placementReason: "The model surface did not align with the image location." }); continue;
        }
      }
      if (!await unchanged()) return { stale: true };
      localized.push({ ...finding, anchor: { ...anchor, zoom } });
    } catch { unplaced.push({ ...finding, placementReason: "The scanned geometry could not locate this feature." }); }
  }
  return { localized, unplaced, stale: false, timings: {
    captureMs: Math.round(captured - started), reviewMs: Math.round(reviewed - captured),
    localizationMs: Math.round(performance.now() - reviewed),
  } };
}


export function anchorScreenPoint(finding, width, height) {
  const box = finding.box_2d, point = finding.anchor_2d;
  if (!boxScreenPoint(box, width, height) || !Array.isArray(point) || point.length !== 2
      || !point.every(Number.isFinite) || point[0] < box[0] || point[0] > box[2]
      || point[1] < box[1] || point[1] > box[3]) return null;
  return { x: point[1] / 1000 * width, y: point[0] / 1000 * height };
}

export function resolveScanId(scanId, sweeps) {
  const sweep = [...sweeps.values()].find((item) => item.enabled !== false &&
    [item.sid, item.id, item.uuid].some((id) => id && id === scanId));
  if (!sweep) throw new Error("This photo’s scan could not be matched to the loaded tour.");
  return sweep.sid || sweep.id;
}

export async function navigateToMarker(sdk, marker, modelId, sweeps) {
  if (marker.modelId !== modelId) throw new Error("This marker belongs to a different model.");
  const scanId = resolveScanId(marker.anchor.scanId, sweeps);
  await sdk.Sweep.moveTo(scanId, { rotation: marker.anchor.rotation });
  if (Number.isFinite(marker.anchor.zoom)) await sdk.Camera.zoomTo(marker.anchor.zoom);
  await sdk.Tag.open(marker.tagId);
}


export function markerStemVector(anchor) {
  // Lift toward the capture camera along the same ray, avoiding surface
  // occlusion without introducing the former vertical pin offset.
  if (!isVector(anchor.cameraPosition) || !isVector(anchor.position)) return { x: 0, y: 0, z: 0 };
  const difference = Object.fromEntries(["x", "y", "z"].map((axis) => [axis, anchor.cameraPosition[axis] - anchor.position[axis]]));
  const distance = Math.hypot(difference.x, difference.y, difference.z);
  if (distance < 0.001) return { x: 0, y: 0, z: 0 };
  return Object.fromEntries(["x", "y", "z"].map((axis) => [axis, difference[axis] / distance * 0.015]));
}

export function createReviewTracker({ maxRequests = 12, maxViews = 8, maxAttempts = 2 } = {}) {
  const attempts = new Map(), completed = new Set();
  let requests = 0;
  return {
    canStart(key) {
      return Boolean(key) && !completed.has(key) && completed.size < maxViews && requests < maxRequests && (attempts.get(key) || 0) < maxAttempts;
    },
    start(key) {
      if (!this.canStart(key)) return false;
      attempts.set(key, (attempts.get(key) || 0) + 1); requests++; return true;
    },
    finish(key, outcome) { if (outcome === "complete") completed.add(key); },
    isComplete(key) { return completed.has(key); },
    exhausted() { return completed.size >= maxViews || requests >= maxRequests; },
    counts() { return { requests, completed: completed.size }; },
  };
}
