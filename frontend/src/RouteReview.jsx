import { useState } from "react";
import { scanLabel } from "./visitReport.js";

function FloorPlan({ geometry, candidate, selected }) {
  const { walls, scans } = geometry;
  const points = [...walls.flat(), ...scans.map((scan) => scan.xy)];
  if (!points.length) return null;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(536 / Math.max(1, maxX - minX), 210 / Math.max(1, maxY - minY));
  const project = ([x, y]) => [32 + (x - minX) * scale, 28 + (maxY - y) * scale];
  const selectedPoint = scans.find((scan) => scan.id === selected)?.xy;
  const activeIndex = candidate?.scan_ids.indexOf(selected) ?? -1;

  function stopMarker(point, index) {
    const [x, y] = project(point);
    return (
      <g key={index} className={index === activeIndex ? "route-map-stop is-active" : "route-map-stop"}>
        <circle cx={x} cy={y} r={15} />
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central">{index + 1}</text>
      </g>
    );
  }

  return (
    <svg className="floor-plan" viewBox="0 0 600 270" role="img"
      aria-label={candidate ? "Indoor map with stops numbered from start to finish" : "Indoor map"}>
      {walls.map(([start, end], index) => {
        const [x1, y1] = project(start);
        const [x2, y2] = project(end);
        return <line className="plan-wall" key={index} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {candidate && <>
        <polyline className="plan-route" points={candidate.points.map((point) => project(point).join(",")).join(" ")} />
        {candidate.points.map((point, index) => index === activeIndex ? null : stopMarker(point, index))}
        {activeIndex >= 0 && stopMarker(candidate.points[activeIndex], activeIndex)}
      </>}
      {selectedPoint && activeIndex < 0 && (
        <circle className="route-map-selected" cx={project(selectedPoint)[0]} cy={project(selectedPoint)[1]} r={10} />
      )}
    </svg>
  );
}

function ViewpointPhoto({ url, caption }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="audit-evidence-image">
      {failed || !url ? <p>A photo for this viewpoint is unavailable.</p>
        : <img src={url} alt={caption} loading="lazy" onError={() => setFailed(true)} />}
    </figure>
  );
}

export default function RouteReview({ report, candidate, onCandidate }) {
  const { auditId, demo, geometry, profile } = report;
  const { walls, scans } = geometry;
  const [start, setStart] = useState(candidate?.scan_ids[0] || "");
  const [end, setEnd] = useState(candidate?.scan_ids.at(-1) || "");
  const [selected, setSelected] = useState(candidate?.scan_ids[0] || "");
  const [marked, setMarked] = useState([]);
  const [lastPath, setLastPath] = useState(candidate?.scan_ids || []);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const pairKey = (pair) => JSON.stringify([...pair].sort());
  const segments = lastPath.slice(1).map((id, index) => [lastPath[index], id]);
  const markedKeys = new Set(marked.map(pairKey));
  const markOptions = new Map([...segments, ...marked].map((pair) => [pairKey(pair), pair]));
  const sortedScans = [...scans].sort((a, b) =>
    scanLabel(geometry, a.id).localeCompare(scanLabel(geometry, b.id), undefined, { numeric: true }));
  const stopIndex = candidate?.scan_ids.indexOf(selected) ?? -1;
  const photoCaption = stopIndex < 0 ? scanLabel(geometry, selected) : `Photo from stop ${stopIndex + 1}`;

  function changeEndpoint(setValue, value) {
    setValue(value);
    setSelected(value);
    onCandidate(null);
    setStatus("Calculate the route to see your new stops.");
  }

  function toggleStep(key, pair, checked) {
    setMarked(checked ? [...marked, pair] : marked.filter((item) => pairKey(item) !== key));
    onCandidate(null);
    setStatus("Calculate the route to apply this change.");
  }

  async function calculate(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("Calculating the route…");
    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId, start, end, stepped: marked }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Route calculation failed.");
      onCandidate(result.candidate);
      setSelected(start);
      if (result.candidate) setLastPath(result.candidate.scan_ids);
      setStatus(result.candidate ? "" : "No path was found between these viewpoints with the current settings.");
    } catch (error) {
      setStatus(error.message || "Route calculation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="route-review" aria-labelledby="route-heading">
      <h3 id="route-heading">{demo ? "Example route inside" : "Possible route inside"}</h3>
      {candidate && <p>About {candidate.metres} m · {candidate.scan_ids.length} stops from start to finish.</p>}
      {!candidate && !status && <p>An indoor route is unavailable for this clinic.</p>}
      {!demo && <p>Match the start and finish to your entrance and check-in. Ask staff about steps and door clearance before relying on the route.</p>}
      {(candidate || selected) && <FloorPlan geometry={geometry} candidate={candidate} selected={selected} />}
      {candidate && (
        <ol className="route-stops" aria-label="Route stops from start to finish">
          {candidate.scan_ids.map((id, index) => (
            <li key={id}>
              <button type="button" aria-pressed={selected === id} onClick={() => setSelected(id)}>
                <span className="route-stop-number" aria-hidden="true">{index + 1}</span>
                {index === 0 && <strong>Start</strong>}
                {index === candidate.scan_ids.length - 1 && <strong>Finish</strong>}
                <span>{scanLabel(geometry, id)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {selected && !demo && (
        <div className="route-stop-photo" aria-live="polite">
          <strong>{photoCaption}</strong>
          <ViewpointPhoto key={selected} url={report.scanPreviews?.[selected]} caption={photoCaption} />
        </div>
      )}
      {auditId && walls.length > 0 && scans.length > 1 && (
        <details className="route-editor">
          <summary>Change start or finish{profile === "step-free" ? " or mark steps" : ""}</summary>
          <form onSubmit={calculate} className="route-form">
            {[[start, setStart, "Start viewpoint"], [end, setEnd, "Finish viewpoint"]].map(([value, setValue, label]) => (
              <label key={label}>
                {label}
                <select className="text-input" value={value} disabled={busy} required
                  onFocus={() => { if (value) setSelected(value); }}
                  onChange={(event) => changeEndpoint(setValue, event.target.value)}>
                  <option value="">Choose a viewpoint</option>
                  {sortedScans.map((scan) => <option key={scan.id} value={scan.id}>{scanLabel(geometry, scan.id)}</option>)}
                </select>
              </label>
            ))}
            {profile === "step-free" && markOptions.size > 0 && (
              <fieldset className="route-marks">
                <legend>Segments with known steps</legend>
                <p>Mark a segment where you know there are steps. The route will avoid it.</p>
                {[...markOptions].map(([key, pair]) => (
                  <label key={key}>
                    <input type="checkbox" checked={markedKeys.has(key)} disabled={busy}
                      onChange={(event) => toggleStep(key, pair, event.target.checked)} />
                    {pair.map((id) => scanLabel(geometry, id)).join(" → ")}
                  </label>
                ))}
              </fieldset>
            )}
            <button type="submit" className="action-secondary" disabled={busy || !start || !end || start === end}>
              Calculate route
            </button>
          </form>
        </details>
      )}
      <p className="status-text" role="status">{status}</p>
    </section>
  );
}
