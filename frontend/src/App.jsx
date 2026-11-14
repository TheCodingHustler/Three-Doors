import { useEffect, useState } from "react";
import "./App.css";

const profiles = [
  { id: "step-free", icon: "↗", title: "Step-free access" },
  { id: "low-vision", icon: "◉", title: "Low-vision navigation" },
  { id: "short-walk", icon: "⌁", title: "Short walking distance" },
];

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

function ToolCard({ icon, number, title, description, active, onClick }) {
  return (
    <button
      className={`tool-card${active ? "" : " tool-card-disabled"}`}
      onClick={onClick}
      type="button"
      disabled={!active}
    >
      <span className="card-number">{number} / 03</span>
      <span className="card-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="card-link">{active ? "Open Access Scan →" : "Coming soon"}</span>
    </button>
  );
}

function Home({ onOpen }) {
  return (
    <main>
      <section className="welcome">
        <div className="welcome-copy">
          <div className="eyebrow">A BETTER WAY TO PREPARE</div>
          <h1>Better care begins before your visit.</h1>
          <p>
            Make a plan for getting there, gather what matters, and feel more
            ready for your next appointment.
          </p>
          <a className="primary-link" href="#tools">Explore Three Doors <span aria-hidden="true">→</span></a>
        </div>
        <div className="welcome-mark" aria-hidden="true">
          <span>01</span><span>02</span><span>03</span>
        </div>
      </section>

      <section className="tools-section" id="tools">
        <div className="section-heading">
          <div className="eyebrow">EXPLORE OUR TOOLS</div>
          <h2>Three doors. One better visit.</h2>
          <p>Start with the details that will make your visit easier.</p>
        </div>
        <div className="tool-grid">
          <ToolCard
            active
            icon="♿"
            number="01"
            title="Access Scan"
            description="Review visible access details and prepare questions for the venue."
            onClick={onOpen}
          />
          <ToolCard
            icon="✚"
            number="02"
            title="Medication Label Reader"
            description="Make medication labels easier to review."
          />
          <ToolCard
            icon="✎"
            number="03"
            title="Symptom & Food Journal"
            description="Organize observations for your next appointment."
          />
        </div>
      </section>
    </main>
  );
}

function FloorPlan({ geometry, candidate }) {
  const walls = geometry?.walls || [];
  const scans = geometry?.scans || [];
  const points = [...walls.flat(), ...scans.map((scan) => scan.xy)];
  if (!points.length) return null;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(536 / Math.max(1, maxX - minX), 210 / Math.max(1, maxY - minY));
  const project = ([x, y]) => [32 + (x - minX) * scale, 25 + (maxY - y) * scale];

  return (
    <svg
      className="floor-plan"
      viewBox="0 0 600 270"
      role="img"
      aria-label={`Floor plan evidence with ${scans.length} scan points${candidate ? " and an unverified scan-to-scan candidate" : ""}`}
    >
      {walls.map(([start, end], index) => {
        const [x1, y1] = project(start);
        const [x2, y2] = project(end);
        return <line className="plan-wall" key={`wall-${index}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {candidate?.points?.length > 1 && (
        <polyline className="plan-route" points={candidate.points.map((point) => project(point).join(",")).join(" ")} />
      )}
      {scans.map((scan) => {
        const [cx, cy] = project(scan.xy);
        const endpoint = candidate?.scan_ids?.[0] === scan.id || candidate?.scan_ids?.at(-1) === scan.id;
        return (
          <circle className={`plan-dot${endpoint ? " plan-endpoint" : ""}`} cx={cx} cy={cy} r={endpoint ? 9 : 6} key={scan.id}>
            <title>{scan.label}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function Report({ report, profile, onReset }) {
  const activeProfile = profiles.find((item) => item.id === (report.profile || profile))?.title;
  return (
    <div className="report-stack" aria-live="polite">
      <section className="report-intro">
        <div>
          <span className="status-pill"><span aria-hidden="true">●</span> {report.source}</span>
          <h2>Access review</h2>
          <p>{report.building || "Sample medical office"} · {activeProfile}</p>
        </div>
        <button className="text-action" onClick={onReset} type="button">Start over</button>
      </section>

      {report.geometry?.scans?.length > 0 && (
        <>
          <FloorPlan geometry={report.geometry} candidate={report.candidate} />
          <p className="geometry-status">{report.geometry.status}</p>
        </>
      )}

      <section className="report-summary">
        <div className="eyebrow">EVIDENCE SUMMARY</div>
        <p>{report.summary}</p>
      </section>

      {report.sources && (
        <ul className="sources" aria-label="Evidence sources">
          {Object.entries(report.sources).map(([name, value]) => (
            <li key={name}><strong>{name}</strong><span>{value}</span></li>
          ))}
        </ul>
      )}

      {report.images?.length > 0 && (
        <section className="provider-imagery">
          <div className="eyebrow">PROVIDER IMAGERY</div>
          <div className="imagery-grid">
            {report.images.map((image) => (
              <figure key={image.id}>
                <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.title} />
                <figcaption>{image.title}</figcaption>
              </figure>
            ))}
          </div>
          {report.ai?.status && <p className="geometry-status">Gemini · {report.ai.status}</p>}
        </section>
      )}

      <section className="observation-list">
        <div className="eyebrow">WHAT TO REVIEW</div>
        {report.observations.map((observation, index) => (
          <article className="observation" key={`${observation.title}-${index}`}>
            <span className="observation-index">0{index + 1}</span>
            <div><h3>{observation.title}</h3><p>{observation.detail}</p></div>
          </article>
        ))}
      </section>

      <section className="confirm-panel">
        <div className="eyebrow">CONFIRM BEFORE THE VISIT</div>
        <ul>{report.confirmations.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <p className="review-caveat">
        This planning aid is not an accessibility certification. Confirm dimensions,
        routes, and accommodations directly with the venue.
      </p>
    </div>
  );
}

function AccessScan({ onBack }) {
  const [buildings, setBuildings] = useState([]);
  const [buildingQuery, setBuildingQuery] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("Loading local building list…");
  const [profile, setProfile] = useState("step-free");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [report, setReport] = useState(null);
  const building = buildings.find((item) => item.id === selectedBuilding);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/buildings?q=${encodeURIComponent(buildingQuery)}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Building search is unavailable.");
        if (!active) return;
        const options = [result.featured, ...result.matches];
        setBuildings(options);
        setSelectedBuilding((current) => {
          const currentIsMatch = result.matches.some((item) => item.id === current);
          if (currentIsMatch) return current;
          if (buildingQuery.trim() && result.matches.length) return result.matches[0].id;
          return result.featured.id;
        });
        setCatalogStatus(result.total
          ? `${result.total} locations in the local catalog. Search by city, address, or venue.`
          : "No matching locations. Try a city or address.");
      } catch (error) {
        if (active) setCatalogStatus(error.message || "The local building list could not be loaded.");
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [buildingQuery]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function chooseFile(nextFile) {
    if (!nextFile) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(nextFile.type)) {
      setStatus("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (nextFile.size > 8 * 1024 * 1024) {
      setStatus("Choose an image smaller than 8 MB.");
      return;
    }
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
    setStatus("");
  }

  async function showDemo() {
    setBusy(true);
    setStatus("Loading the simulated floor plan…");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building: building?.id, profile, demo: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The guided demo could not be loaded.");
      setReport(result);
      setStatus("Guided demo ready. Its geometry is simulated and unrelated to the selected building.");
    } catch (error) {
      setStatus(error.message || "The guided demo could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function runLocationReport() {
    if (!building) {
      setStatus("Choose a building from the local list first.");
      return;
    }
    setBusy(true);
    setStatus("Preparing the location report…");
    setReport(null);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building: building.id, profile, demo: false }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The location report could not be created.");
      setReport(result);
      setStatus("Location report ready. Review provider status and confirm details with the venue.");
    } catch (error) {
      setStatus(error.message || "The location report could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewPhoto() {
    if (!file) {
      setStatus("Add a clear photo to request a Gemini review, or try the guided demo.");
      return;
    }
    setBusy(true);
    setStatus("Reviewing visible details with Gemini…");
    setReport(null);
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building: building ? `${building.name} · ${building.address}, ${building.city}` : "",
          profile,
          mimeType: file.type,
          imageData: await readAsBase64(file),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gemini could not review this image.");
      setReport({ ...result, building: building ? `${building.name} · ${building.address}, ${building.city}` : "", profile, demo: false });
      setStatus("Gemini review complete. Check each observation against the original image.");
    } catch (error) {
      setStatus(error.message || "The photo could not be reviewed.");
    } finally {
      setBusy(false);
    }
  }

  function resetReport() {
    setReport(null);
    setStatus("");
  }

  return (
    <main className="tool-page">
          <button className="back-button" onClick={onBack} type="button">
        <span aria-hidden="true">←</span> Back to tools
      </button>
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">THREE DOORS / ACCESS SCAN</div>
          <h1>Plan a more accessible visit.</h1>
          <p>Choose a location and access need to review available evidence and prepare practical questions.</p>
        </div>
        <div className="workspace-seal" aria-hidden="true"><span>01</span><span>ACCESS</span></div>
      </div>

      <div className="audit-layout">
        <section className="med-panel audit-form-panel">
          <div className="med-panel-heading">
            <span className="med-step">01 / YOUR VISIT</span>
            <h2>Choose a building</h2>
            <p>Search eligible locations in the local CoStar and Matterport cross-reference.</p>
          </div>

          <label className="field-label" htmlFor="building-search">Find a building</label>
          <input
            id="building-search"
            className="text-input"
            type="search"
            value={buildingQuery}
            onChange={(event) => setBuildingQuery(event.target.value)}
            maxLength={100}
            placeholder="Search Houston or Los Angeles"
          />
          <label className="field-label" htmlFor="building-select">Building</label>
          <select
            id="building-select"
            className="text-input"
            value={selectedBuilding}
            onChange={(event) => setSelectedBuilding(event.target.value)}
          >
            {buildings.map((item) => (
              <option key={item.id} value={item.id}>{item.name} · {item.address}, {item.city}</option>
            ))}
          </select>
          <p className="catalog-status" role="status">{catalogStatus}</p>

          <fieldset className="profile-fieldset">
            <legend>What would you like to check?</legend>
            <div className="profile-options">
              {profiles.map((item) => (
                <label className={`profile-option${profile === item.id ? " selected" : ""}`} key={item.id}>
                  <input
                    type="radio"
                    name="profile"
                    value={item.id}
                    checked={profile === item.id}
                    onChange={() => setProfile(item.id)}
                  />
                  <span className="profile-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.title}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="audit-actions">
            <button className="action-primary" onClick={runLocationReport} disabled={busy || !building} type="button">
              Run location report <span aria-hidden="true">→</span>
            </button>
            <button className="action-secondary" onClick={showDemo} disabled={busy} type="button">
              Run guided demo
            </button>
          </div>
          <p className="status-text" role="status" aria-live="polite">{status}</p>

          <details className="optional-evidence">
            <summary>Optional: review a photo with Gemini</summary>
            <p>Use a photo of an entrance, doorway, corridor, or drop-off. It supplements the selected building record.</p>
            <input
              className="visually-hidden"
              id="audit-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            <label
              className={`upload-zone${dragging ? " dragging" : ""}${preview ? " has-preview" : ""}`}
              htmlFor="audit-image"
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}
            >
              {preview ? <img src={preview} alt="Selected access photo preview" className="photo-preview" /> : <>
                <span className="upload-symbol" aria-hidden="true">↑</span>
                <strong>Choose or drop a photo</strong>
                <span>JPG, PNG, WebP · up to 8 MB</span>
              </>}
              {file && <span className="selected-file">{file.name}</span>}
            </label>
            <button className="action-secondary" onClick={reviewPhoto} disabled={busy || !file} type="button">
              Review photo with Gemini
            </button>
            <p className="privacy-note">The image is sent to Google Gemini and is not stored by this app. Review Google&apos;s data terms before sharing sensitive images.</p>
          </details>
        </section>

        <section className="med-panel results-panel" aria-label="Access review result">
          {report ? (
            <Report report={report} profile={profile} onReset={resetReport} />
          ) : (
            <div className="empty-report">
              <span className="empty-mark" aria-hidden="true">✦</span>
              <div className="med-step">03 / REVIEW</div>
              <h2>Your review will appear here</h2>
              <p>Choose a building to review its local record, or run the guided demo to see an illustrative floor plan.</p>
              <div className="empty-rule"><span></span><span></span><span></span></div>
              <p className="empty-footnote">AI observations are suggestions, not verified measurements or access guarantees.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function App() {
  const [home, setHome] = useState(true);

  function openAccessScan() {
    setHome(false);
  }

  function showHome() {
    setHome(true);
    window.history.replaceState(null, "", window.location.pathname);
  }

  return (
    <div className="app">
      <header className="navbar">
        <button className="brand" onClick={showHome} type="button"><span aria-hidden="true">✦</span> THREE DOORS</button>
        <span className="nav-label">YOUR VISIT, SIMPLIFIED</span>
      </header>
      {home ? <Home onOpen={openAccessScan} /> : <AccessScan onBack={showHome} />}
      <footer className="site-footer">Designed to make healthcare feel more human.</footer>
    </div>
  );
}

export default App;