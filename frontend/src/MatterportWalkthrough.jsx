import { useEffect, useRef, useState } from "react";
import { loadSdk } from "./matterportSdk.js";
import { getSweepSnapshot, sweepFingerprint, addBarrierTag, waitForPlaying } from "./preparedWalkthrough.js";
import { connectFrame, connectionError, safeErrorDetail } from "./walkthroughConnection.js";
import { barrierImpact } from "./barrierImpact.js";
import { analyzeWalkthroughView, viewKey, resolveScanId, navigateToMarker, markerStemVector, createReviewTracker } from "./walkthroughAnchors.js";

export default function MatterportWalkthrough({ matterport, evidence, profile, request, prepared }) {
  const frame = useRef(null);
  const section = useRef(null);
  const tags = useRef([]);
  const navigate = useRef(null);
  const sweeps = useRef(new Map());
  const zoom = useRef(1);
  const navigation = useRef(Promise.resolve());
  const navigationVersion = useRef(0);
  const navigating = useRef(false);
  const [key, setKey] = useState("");
  const [sdk, setSdk] = useState(null);
  const [loadedFrame, setLoadedFrame] = useState(null);
  const [configReady, setConfigReady] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [status, setStatus] = useState("Checking walkthrough annotation access…");
  const [markers, setMarkers] = useState([]);
  const [unplaced, setUnplaced] = useState([]);
  const [selected, setSelected] = useState("");
  const [timings, setTimings] = useState(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [cacheMode, setCacheMode] = useState(prepared ? "checking" : "live");

  useEffect(() => {
    let active = true;
    fetch("/api/walkthrough-config").then((response) => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then((config) => {
      if (!active) return;
      if (config.sdkKey) { setKey(config.sdkKey); setStatus("Connecting automatic barrier detection…"); }
      else setStatus("Automatic annotations need a Matterport SDK key. Add MATTERPORT_SDK_KEY to .env, then reload.");
      setConfigReady(true);
    }).catch(() => { if (active) { setConfigReady(true); setStatus("Could not load annotation settings. Check the local backend."); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!key || !loadedFrame || loadedFrame !== frame.current) return;
    let active = true;
    setConnectionFailed(false);
    const timer = setTimeout(() => {
      if (active) {
        setConnectionFailed(true);
        setStatus(`Matterport SDK connection timed out on ${window.location.origin}. Retry the connection or check that this exact host and port are allowed by the key.`);
      }
    }, 20000);
    loadSdk(key).then((api) => {
      if (!active || frame.current !== loadedFrame) return null;
      return connectFrame(api, loadedFrame, key);
    }).then(async (connection) => {
      if (!active || !connection) return;
      const model = await connection.Model.getData();
      if (model.sid !== matterport.modelId) throw new Error("The connected tour does not match the report’s model.");
      if (active) { setConnectionFailed(false); setSdk(connection); }
    }).catch((error) => {
      if (active) { setConnectionFailed(true); setStatus(connectionError(error, key, window.location.origin)); }
    }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); };
  }, [key, loadedFrame]);

  useEffect(() => {
    if (!sdk) return;
    sweeps.current = new Map();
    const subscription = sdk.Sweep.data.subscribe({
      onAdded: (id, value) => sweeps.current.set(id, value),
      onUpdated: (id, value) => sweeps.current.set(id, value),
      onRemoved: (id) => sweeps.current.delete(id),
    });
    const zoomSubscription = sdk.Camera.zoom.subscribe((value) => { zoom.current = value.level; });
    return () => { subscription.cancel(); zoomSubscription.cancel(); };
  }, [sdk]);

  useEffect(() => {
    if (!sdk || !prepared) return;
    let active = true;
    const controller = new AbortController();
    const added = [];
    setCacheMode("checking");
    let stage = "Checking saved review";
    async function restore() {
      if (prepared.modelId !== matterport.modelId || prepared.profile !== profile || prepared.expiresAt * 1000 <= Date.now()) {
        throw new Error("Saved review is expired or belongs to a different clinic/profile.");
      }
      stage = "Waiting for the walkthrough to finish loading";
      setStatus("Waiting for Matterport to finish loading before restoring saved markers…");
      await waitForPlaying(sdk, controller.signal);
      stage = "Matching the saved model scans";
      const scans = await getSweepSnapshot(sdk, controller.signal);
      if (await sweepFingerprint(scans) !== prepared.modelFingerprint) throw new Error("The model’s scan layout changed since preparation.");
      const failures = [];
      for (const finding of prepared.findings.filter((item) => item.anchor)) {
        if (!active) return;
        stage = `Adding saved marker: ${finding.title}`;
        let tagId;
        try { tagId = await addBarrierTag(sdk, finding, profile, true); }
        catch (error) { failures.push(`${finding.title}: ${safeErrorDetail(error, key)}`); continue; }
        if (!active) { await sdk.Tag.remove(tagId); return; }
        added.push({ ...finding, tagId, modelId: matterport.modelId });
        setMarkers([...added]);
      }
      if (active) {
        setUnplaced(prepared.findings.filter((item) => !item.anchor));
        setCacheMode(failures.length ? "partial" : "cached");
        setStatus(failures.length ? `Could not add ${failures.length} saved markers: ${failures.join("; ")}` : "");
      }
    }
    restore().catch((error) => {
      if (active) {
        for (const marker of added) sdk.Tag.remove(marker.tagId).catch(() => {});
        added.length = 0;
        setMarkers([]); setCacheMode("unavailable");
        setStatus(`${stage}: ${safeErrorDetail(error, key)} Saved findings are intact; retry marker restoration without rerunning Gemini.`);
      }
    });
    return () => { active = false; controller.abort(); for (const marker of added) sdk.Tag.remove(marker.tagId).catch(() => {}); };
  }, [sdk, prepared, profile, matterport.modelId, restoreAttempt]);

  useEffect(() => {
    if (!sdk || cacheMode !== "live") return;
    let active = true, busy = false, timer, latestPose, lastViewKey = "";
    const reviews = createReviewTracker();
    const controller = new AbortController();
    const added = [];
    tags.current = added;
    setMarkers([]); setUnplaced([]);
    const currentKey = () => `${viewKey(latestPose, frame.current?.clientWidth, frame.current?.clientHeight)}:${zoom.current}`;

    async function analyze() {
      if (!active || busy || navigating.current || !latestPose?.sweep) return;
      const width = frame.current?.clientWidth, height = frame.current?.clientHeight;
      if (!width || !height) return;
      const capturedKey = currentKey();
      const version = navigationVersion.current;
      if (!reviews.canStart(capturedKey)) {
        if (reviews.exhausted()) setStatus(`Automatic review paused after ${reviews.counts().completed} completed views and ${reviews.counts().requests} attempts. Existing markers remain visible.`);
        return;
      }
      busy = true;
      reviews.start(capturedKey);
      let outcome = "failed";
      setStatus("Automatically checking this view for possible barriers…");
      try {
        const result = await analyzeWalkthroughView({
          sdk, width, height, profile, signal: controller.signal,
          isCurrent: () => active && !navigating.current && navigationVersion.current === version && currentKey() === capturedKey,
          getZoom: () => zoom.current,
          onStage: (stage) => {
            if (!active) return;
            setStatus({ capture: "Capturing this view…", review: "Checking the image for barriers…", placement: "Locating detected barriers in the walkthrough…" }[stage]);
          },
        });
        if (!active) return;
        if (result.stale) {
          outcome = "stale";
          setStatus("View changed during analysis. Checking the current view next…");
          return;
        }
        let count = 0;
        const placementStarted = performance.now();
        for (const finding of result.localized) {
          if (!active) break;
          // The same physical feature can appear in several camera views.
          const duplicate = added.some((item) => Math.hypot(
            item.anchor.position.x - finding.anchor.position.x,
            item.anchor.position.y - finding.anchor.position.y,
            item.anchor.position.z - finding.anchor.position.z) < 0.4);
          if (duplicate) continue;
          const [tagId] = await sdk.Tag.add({
            label: `Possible barrier: ${finding.title}`,
            description: `${finding.detail}\n\n${barrierImpact(finding, profile).join(" ")}\n\nAutomatically detected and positioned. Confirm conditions with staff.`,
            anchorPosition: finding.anchor.position,
            stemVector: markerStemVector(finding.anchor),
            stemVisible: false,
            color: { r: 0.85, g: 0.08, b: 0.08 },
          });
          if (!active) { await sdk.Tag.remove(tagId); break; }
          const marker = { ...finding, tagId, modelId: matterport.modelId };
          added.push(marker); count++;
          setMarkers([...added]);
          // Opening the explanation should not trigger Matterport's default
          // move-toward-tag behavior and replace the recorded camera view.
          await sdk.Tag.allowAction(tagId, { opening: true, navigating: false, docking: true, sharing: false });
        }
        setTimings({ ...result.timings, pinMs: Math.round(performance.now() - placementStarted) });
        outcome = "complete";
        if (result.unplaced.length) setUnplaced((previous) => [...previous, ...result.unplaced].slice(-8));
        setStatus(count ? `Added ${count} automatic barrier marker${count === 1 ? "" : "s"}. Click a red marker for details.`
          : result.unplaced.length ? "Possible barriers found, but their positions could not be matched to scanned surfaces. See the findings below."
          : result.localized.length ? "This view contains barriers already marked in the tour."
          : "No barrier was detected in this view for your selected access needs. Other views and unseen conditions remain unchecked.");
      } catch (error) {
        if (active) setStatus(error.message || "Automatic review is unavailable. Evidence findings are still available below.");
      } finally {
        reviews.finish(capturedKey, outcome);
        busy = false;
        if (active && reviews.canStart(currentKey())) {
          if (outcome === "failed") setStatus((message) => `${message} Retrying automatically once if this view remains still…`);
          timer = setTimeout(analyze, outcome === "failed" ? 4000 : 1500);
        }
      }
    }
    const subscription = sdk.Camera.pose.subscribe((pose) => {
      latestPose = pose;
      const nextKey = currentKey();
      if (nextKey === lastViewKey) return;
      lastViewKey = nextKey;
      clearTimeout(timer);
      timer = setTimeout(analyze, 1500);
    });
    const zoomChanges = sdk.Camera.zoom.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(analyze, 1500);
    });
    const resize = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(analyze, 1500); });
    if (frame.current) resize.observe(frame.current);
    return () => {
      active = false; clearTimeout(timer); controller.abort();
      subscription.cancel(); zoomChanges.cancel(); resize.disconnect();
      for (const marker of added) sdk.Tag.remove(marker.tagId).catch(() => {});
    };
  }, [sdk, profile, matterport.modelId, cacheMode]);

  useEffect(() => {
    if (!sdk || !markers.length || !sdk.Tag.openTags?.subscribe) return;
    const subscription = sdk.Tag.openTags.subscribe({
      onChanged(state) {
        const selectedIds = state.selected ? [...state.selected] : [];
        const id = [state.docked, ...selectedIds].find((candidate) => markers.some((marker) => marker.tagId === candidate));
        if (id) setSelected(id);
      },
    });
    return () => subscription.cancel();
  }, [sdk, markers]);

  navigate.current = (finding) => {
    section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!sdk) return;
    const version = ++navigationVersion.current;
    navigating.current = true;
    navigation.current = navigation.current.catch(() => {}).then(async () => {
      if (version !== navigationVersion.current) return;
      try {
        const cachedMarker = finding.preparedMarkerId ? markers.find((item) => item.preparedMarkerId === finding.preparedMarkerId) : null;
        if (finding.preparedMarkerId && !cachedMarker) throw new Error("The saved marker is not ready or cannot be matched to the current model.");
        const target = cachedMarker || finding;
        if (target.tagId) {
          await navigateToMarker(sdk, target, matterport.modelId, sweeps.current);
          setSelected(target.tagId);
        } else {
          const scanId = resolveScanId(evidence.get(finding.evidence)?.scanId, sweeps.current);
          await sdk.Sweep.moveTo(scanId, {});
          setStatus("Opened the photo’s source scan. Its original facing direction is unavailable; see the evidence photo for the exact feature.");
        }
      } catch (error) { setStatus(safeErrorDetail(error, key) || "This viewpoint could not be opened."); }
      finally { if (version === navigationVersion.current) navigating.current = false; }
    });
  };
  useEffect(() => {
    if (request?.finding) navigate.current(request.finding);
  }, [request, sdk]);

  const url = new URL(matterport.viewerUrl);
  if (key) url.searchParams.set("applicationKey", key);
  const selectedFinding = markers.find((marker) => marker.tagId === selected);
  return (
    <section className="matterport-viewer" ref={section} aria-labelledby="walkthrough-heading">
      <div className="viewer-heading">
        <h3 id="walkthrough-heading">Walk through the clinic</h3>
        <a href={matterport.viewerUrl} target="_blank" rel="noreferrer">Open full tour ↗</a>
      </div>
      <div className="viewer-frame barrier-tour-frame">
        {configReady && <iframe key={`${key}:${connectionAttempt}`} ref={frame} src={url.toString()}
          onLoad={(event) => setLoadedFrame(event.currentTarget)} title="Clinic walkthrough"
          allow="fullscreen; xr-spatial-tracking" allowFullScreen /> }
      </div>
      {status && !status.includes("No live AI request was needed.") && <p role="status">{status}</p>}
      {prepared && sdk && ["unavailable", "partial"].includes(cacheMode) && <button type="button"
        onClick={() => setRestoreAttempt((value) => value + 1)}>Retry saved markers</button>}
      {connectionFailed && <div className="barrier-tour-controls">
        <button type="button" onClick={() => {
          navigationVersion.current++; navigating.current = false;
          setSdk(null); setLoadedFrame(null); setConnectionFailed(false);
          setStatus("Reconnecting to the walkthrough…");
          setConnectionAttempt((value) => value + 1);
        }}>Retry SDK connection</button>
        {window.location.hostname === "127.0.0.1" && <p>Your key may allow localhost only. <a href={`http://localhost:${window.location.port}/`}>Open this app on localhost</a>.</p>}
      </div>}
      {timings && <details><summary>Last view analysis timing</summary>
        <p>Capture: {(timings.captureMs / 1000).toFixed(1)} s · AI request and network: {(timings.reviewMs / 1000).toFixed(1)} s · Positioning and pins: {((timings.localizationMs + timings.pinMs) / 1000).toFixed(1)} s</p>
      </details>}
      {!prepared && <p>Views are checked automatically when the camera stops. Red markers show possible barriers for your access needs; positions are approximate.</p>}
      {markers.length > 0 && <div className="barrier-tour-controls">
        <label>Detected in the walkthrough <select value={selected} onChange={(event) => {
          const marker = markers.find((item) => item.tagId === event.target.value);
          if (marker) navigate.current(marker);
        }}><option value="">Select a possible barrier</option>{markers.map((marker) => (
          <option key={marker.tagId} value={marker.tagId}>{marker.title}</option>
        ))}</select></label>
        <ul>{markers.map((marker) => <li key={marker.tagId}>
          <button type="button" className="text-action" onClick={() => navigate.current(marker)}>Show {marker.title} in walkthrough</button>
        </li>)}</ul>
        {selectedFinding && <><p>{selectedFinding.detail}</p>
          {barrierImpact(selectedFinding, profile).map((text) => <p key={text}>{text}</p>)}
        </>}
      </div>}
      {unplaced.length > 0 && <details><summary>Findings without a reliable 3D position</summary>
        <ul>{unplaced.map((item, index) => <li key={index}><strong>{item.title}</strong><p>{item.detail}</p><p>{item.placementReason}</p></li>)}</ul>
      </details>}
    </section>
  );
}
