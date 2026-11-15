import { useEffect, useRef, useState } from "react";
import { loadSdk } from "./matterportSdk.js";
import { connectFrame, connectionError, safeErrorDetail } from "./walkthroughConnection.js";
import { analyzeWalkthroughView } from "./walkthroughAnchors.js";
import { getSweepSnapshot, sweepFingerprint, capturePlan, apiPost } from "./preparedWalkthrough.js";
import "./App.css";

const MODEL_ID = "x37LjPx62VA";
const PROFILE = "step-free";

export default function PrepareClinic() {
  const frame = useRef(null);
  const [key, setKey] = useState("");
  const [loaded, setLoaded] = useState(null);
  const [status, setStatus] = useState("Loading preparation settings…");
  const [progress, setProgress] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/walkthrough-config").then((r) => r.json()).then((config) => {
      if (!active) return;
      if (!config.sdkKey) throw new Error("Add MATTERPORT_SDK_KEY to .env before preparing this clinic.");
      setKey(config.sdkKey); setStatus("Connecting to the clinic’s 3D model…");
    }).catch((error) => { if (active) setStatus(error.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded || loaded !== frame.current) return;
    // Defer kickoff so React StrictMode's first effect cleanup cannot launch a duplicate job.
    const controller = new AbortController();
    const { signal } = controller;
    let poseSubscription, zoomSubscription;
    const timer = setTimeout(() => {
      if (signal.aborted) return;
      run().catch((error) => {
        if (!signal.aborted) setStatus(`Preparation stopped: ${safeErrorDetail(error, key)} Existing published results remain available. Reload to start a new pass.`);
      });
    }, 0);
    async function run() {
      const api = await loadSdk(key);
      if (signal.aborted) return;
      const sdk = await connectFrame(api, loaded, key).catch((error) => { throw new Error(connectionError(error, key, window.location.origin)); });
      if (signal.aborted) return;
      const model = await sdk.Model.getData();
      if (model.sid !== MODEL_ID) throw new Error("Loaded model does not match the Houston clinic.");
      let latestPose, zoom = 1;
      poseSubscription = sdk.Camera.pose.subscribe((value) => { latestPose = value; });
      zoomSubscription = sdk.Camera.zoom.subscribe((value) => { zoom = value.level; });
      const scans = await getSweepSnapshot(sdk, signal);
      const fingerprint = await sweepFingerprint(scans);
      const initial = await sdk.Camera.getPose();
      const statusResponse = await fetch(`/api/prepared/status?model=${MODEL_ID}&profile=${PROFILE}`, { signal });
      if (!statusResponse.ok) throw new Error("Could not check saved preparation progress.");
      const saved = await statusResponse.json();
      const resume = saved.preparation;
      const plan = resume?.status === "preparing" && resume.fingerprint === fingerprint
        ? resume.plan : capturePlan(scans, initial.sweep);
      setStatus("Creating a preparation job and loading room geometry…");
      const job = await apiPost("/api/prepared/start", { building: MODEL_ID, profile: PROFILE, fingerprint, plan }, signal);
      let pins = job.localizedCount || 0;
      const completed = new Set(job.completedViews || []);
      for (let index = 0; index < plan.length; index++) {
        if (signal.aborted) return;
        if (completed.has(index)) continue;
        const view = plan[index];
        setProgress({ current: index + 1, total: plan.length, pins });
        setStatus(`Preparing view ${index + 1} of ${plan.length}: moving the camera…`);
        await sdk.Sweep.moveTo(view.scanId, { rotation: view.rotation });
        await sdk.Camera.zoomReset();
        await new Promise((resolve) => setTimeout(resolve, 700));
        let result;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
          result = await analyzeWalkthroughView({ sdk, width: loaded.clientWidth, height: loaded.clientHeight,
            profile: PROFILE, signal, includeEvidence: true, getZoom: () => zoom,
            isCurrent: () => !signal.aborted && Boolean(latestPose?.sweep),
            onStage: (stage) => { if (!signal.aborted) setStatus(`View ${index + 1}/${plan.length}: ${stage === "review" ? "Gemini is reviewing the image" : stage === "capture" ? "capturing evidence" : "locating barriers in 3D"}…`); },
          });
          } catch (error) {
            if (signal.aborted || attempt === 2 || error.quotaType === "daily") throw error;
            const seconds = Math.min(300, Math.max(1, Number(error.retryAfterSeconds) || 15));
            setStatus(`View ${index + 1}/${plan.length}: ${error.quotaType ? "Gemini rate limit" : "temporary review failure"}; waiting ${seconds} seconds before retrying. Your ${index} completed view slots remain saved.`);
            await new Promise((resolve) => {
              const wait = setTimeout(resolve, seconds * 1000);
              signal.addEventListener("abort", () => { clearTimeout(wait); resolve(); }, { once: true });
            });
            if (signal.aborted) return;
            continue;
          }
          if (!result.stale) break;
        }
        if (result.stale) throw new Error("The camera moved during capture. Leave this preparation tab untouched.");
        // Store SDK canonical IDs consistently; getPose may use the legacy UUID.
        const matches = scans.filter((scan) => [scan.sid, scan.id, scan.uuid].includes(view.scanId));
        for (const finding of result.localized) {
          if (!matches.some((scan) => [scan.sid, scan.id, scan.uuid].includes(finding.anchor.scanId))) throw new Error("Capture changed scans unexpectedly.");
          finding.anchor.scanId = view.scanId;
        }
        await apiPost("/api/prepared/view", { jobId: job.jobId, viewId: index, building: "Houston clinic",
          profile: PROFILE, ...result.screenshot, localized: result.localized, unplaced: result.unplaced }, signal);
        pins += result.localized.length;
      }
      const endingFingerprint = await sweepFingerprint(await getSweepSnapshot(sdk, signal));
      if (endingFingerprint !== fingerprint) throw new Error("Model scans changed during preparation; results were not published.");
      const result = await apiPost("/api/prepared/publish", { jobId: job.jobId }, signal);
      if (!signal.aborted) {
        setDone(true); setProgress({ current: plan.length, total: plan.length, pins });
        setStatus(`Prepared ${result.reviewedViews} views. Published version ${result.versionId.slice(0, 8)}. New reports for this clinic will load the saved review.`);
      }
    }
    return () => { clearTimeout(timer); controller.abort(); poseSubscription?.cancel(); zoomSubscription?.cancel(); };
  }, [key, loaded]);

  return <main className="clinic-preparation">
    <h1>Prepare clinic walkthrough</h1>
    <h2>7440 Cypress Creek Pky, Houston</h2>
    <p>Planning for step-free &amp; wheelchair access</p>
    <p>This internal preparation pass visits up to three scan locations in six directions each. Leave this tab open and do not move the camera. It uses Gemini API requests.</p>
    <p role="status">{status}</p>
    {progress && <><progress value={progress.current} max={progress.total} /><p>{progress.current}/{progress.total} views · {progress.pins} localized findings before deduplication</p></>}
    {key && <iframe ref={frame} src={`https://my.matterport.com/show/?m=${MODEL_ID}&play=1&qs=1&applicationKey=${encodeURIComponent(key)}`}
      title="Clinic preprocessing walkthrough" onLoad={(event) => setLoaded(event.currentTarget)} allow="fullscreen; xr-spatial-tracking" allowFullScreen />}
    {done && <p><a href="/?clinic=x37LjPx62VA&profile=step-free">Open the prepared clinic report</a></p>}
  </main>;
}
