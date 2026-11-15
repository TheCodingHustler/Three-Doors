import { isVector, markerStemVector } from "./walkthroughAnchors.js";
import { barrierImpact } from "./barrierImpact.js";

export function getSweepSnapshot(sdk, signal) {
  return new Promise((resolve, reject) => {
    let subscription, quiet;
    const values = new Map();
    const finish = (error) => {
      clearTimeout(quiet); clearTimeout(timeout);
      subscription?.cancel(); signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve([...values.values()]);
    };
    const abort = () => finish(new Error("Preparation cancelled"));
    const timeout = setTimeout(() => finish(new Error("The model’s scans did not become available.")), 15000);
    const update = (id, item) => {
      values.set(id, item);
      clearTimeout(quiet); quiet = setTimeout(() => finish(), 700);
    };
    subscription = sdk.Sweep.data.subscribe({ onAdded: update, onUpdated: update,
      onRemoved: (id) => { values.delete(id); },
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export function signatureData(sweeps) {
  return sweeps.filter((item) => item.enabled !== false && item.alignmentType !== "unaligned" && isVector(item.position))
    .map((item) => ({ id: item.sid || item.id || item.uuid, uuid: item.uuid || "",
      position: [item.position.x, item.position.y, item.position.z].map((v) => Math.round(v * 10000)),
      rotation: [item.rotation?.x || 0, item.rotation?.y || 0, item.rotation?.z || 0].map((v) => Math.round(v * 10000)),
    })).sort((a, b) => a.id.localeCompare(b.id));
}

export async function sweepFingerprint(sweeps) {
  const data = new TextEncoder().encode(JSON.stringify(signatureData(sweeps)));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function capturePlan(sweeps, initialScan, limit = 3) {
  const available = signatureData(sweeps);
  if (!available.length) throw new Error("No aligned scans are available for preparation.");
  const selected = [available.find((item) => item.id === initialScan || item.uuid === initialScan) || available[0]];
  const distance = (a, b) => Math.hypot(...a.position.map((v, i) => v - b.position[i]));
  while (selected.length < Math.min(limit, available.length)) {
    const remaining = available.filter((item) => !selected.includes(item));
    remaining.sort((a, b) => Math.min(...selected.map((s) => distance(b, s))) - Math.min(...selected.map((s) => distance(a, s))));
    selected.push(remaining[0]);
  }
  return selected.flatMap((scan) => [0, 60, 120, 180, 240, 300].map((yaw) => ({ scanId: scan.id, scanUuid: scan.uuid, rotation: { x: -10, y: yaw } })));
}

export async function apiPost(path, body, signal) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Preparation request failed");
  return data;
}

export function waitForPlaying(sdk, signal, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let subscription, settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      subscription?.cancel();
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new Error("Marker restoration cancelled"));
    const timer = setTimeout(() => finish(new Error("Matterport has not finished loading. Retry saved markers once the tour is ready.")), timeoutMs);
    if (!sdk.App?.state?.subscribe) { finish(new Error("The SDK cannot report whether the tour is ready.")); return; }
    subscription = sdk.App.state.subscribe((state) => {
      if (state.phase === (sdk.App.Phase?.PLAYING || "appphase.playing")) finish();
      else if (state.phase === (sdk.App.Phase?.ERROR || "appphase.error")) finish(new Error("Matterport reported a model loading error."));
    });
    if (settled) subscription?.cancel();
    else { signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort(); }
  });
}

export async function addBarrierTag(sdk, finding, profile, cached = false) {
  const ids = await sdk.Tag.add({
    label: `Possible barrier: ${finding.title}`.slice(0, 60),
    description: `${finding.detail}\n\n${barrierImpact(finding, profile).join(" ")}\n\n${cached ? "Prepared" : "Automatic"} imagery review. Confirm current conditions with staff.`,
    anchorPosition: finding.anchor.position, stemVector: markerStemVector(finding.anchor), stemVisible: false,
    enabled: true, opacity: 1,
    color: { r: 0.85, g: 0.08, b: 0.08 },
  });
  const tagId = ids?.[0];
  if (typeof tagId !== "string" || !tagId) throw new Error("Matterport did not return an ID for the new marker.");
  // Interaction preferences are optional. Their failure must not delete an
  // otherwise valid marker or prevent the other cached pins from loading.
  try { await sdk.Tag.allowAction(tagId, { opening: true, navigating: false, docking: true, sharing: false }); }
  catch { /* The walkthrough list still restores the exact saved view. */ }
  return tagId;
}
