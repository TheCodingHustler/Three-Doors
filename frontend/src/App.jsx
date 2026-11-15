import { useEffect, useState } from "react";
import MedicationReader from "./features/labels/Medications.jsx";
import SymptomJournal from "./SymptomJournal.jsx";
import VisitPacket from "./VisitPacket.jsx";
import "./App.css";

const profiles = [
  { id: "step-free", icon: "↗", title: "Step-free access" },
  { id: "low-vision", icon: "◉", title: "Low-vision navigation" },
  { id: "short-walk", icon: "⌁", title: "Short walking distance" },
];

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

      {report.matterport?.viewerUrl && (
        <section className="matterport-viewer" aria-label="Interactive Matterport walkthrough">
          <div className="viewer-heading">
            <div>
              <div className="eyebrow">MATTERPORT WALKTHROUGH</div>
              <h3>Explore the captured space</h3>
            </div>
            <a href={report.matterport.viewerUrl} target="_blank" rel="noreferrer">Open full tour <span aria-hidden="true">↗</span></a>
          </div>
          <div className="viewer-frame">
            <iframe
              src={report.matterport.viewerUrl}
              title={`Matterport walkthrough: ${report.building}`}
              allow="fullscreen; xr-spatial-tracking"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </section>
      )}

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

      {report.matterport && (
        <section className="room-measurements" aria-label="Matterport room measurements">
          <div className="eyebrow">MATTERPORT ROOM MEASUREMENTS · METRIC</div>
          {report.geometry?.rooms?.length ? (
            <div className="measurements-scroll">
              <table>
                <thead>
                  <tr><th scope="col">Room</th><th scope="col">Area m²</th><th scope="col">Width m</th><th scope="col">Depth m</th><th scope="col">Height m</th></tr>
                </thead>
                <tbody>
                  {report.geometry.rooms.map((room, index) => (
                    <tr key={room.evidence_id}>
                      <th scope="row">{room.label} {index + 1}</th>
                      <td>{room.area_m2?.toFixed(2) || "Not measured"}</td>
                      <td>{room.width_m?.toFixed(2) || "Not measured"}</td>
                      <td>{room.depth_m?.toFixed(2) || "Not measured"}</td>
                      <td>{room.height_m?.toFixed(2) || "Not measured"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="geometry-status">No room dimensions are available for this model.</p>}
          <p className="measurement-caveat">Room dimensions do not establish doorway clear width, threshold height, ramp slope, or turning clearance.</p>
        </section>
      )}

      {report.ai && (
        <section className="walkthrough-review" aria-label="Gemini walkthrough review">
          <div className="walkthrough-heading">
            <div>
              <div className="eyebrow">TARGETED WALKTHROUGH REVIEW</div>
              <h3>Gemini · {report.ai.status}</h3>
            </div>
            <span className="walkthrough-count">{report.ai.observations?.length || 0} findings</span>
          </div>
          {report.ai.summary && <p className="walkthrough-summary">{report.ai.summary}</p>}
          {report.ai.measurementReview && (
            <div className="measurement-review">
              <div className="eyebrow">ROOM-MEASUREMENT REVIEW</div>
              <p>{report.ai.measurementReview}</p>
            </div>
          )}
          {report.ai.observations?.length > 0 && (
            <ul className="walkthrough-findings">
              {report.ai.observations.map((item, index) => (
                <li key={`${item.evidence}-${item.title}-${index}`}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <small>Evidence: {item.evidence}</small>
                </li>
              ))}
            </ul>
          )}
          {report.ai.confirmations?.length > 0 && (
            <div className="walkthrough-questions">
              <strong>Questions for the venue</strong>
              <ul>{report.ai.confirmations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            </div>
          )}
          {report.ai.limitations && <p className="walkthrough-limitations">Limitations: {report.ai.limitations}</p>}
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
        <ul>{report.confirmations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
      </section>

      <p className="review-caveat">
        This planning aid is not an accessibility certification. Confirm dimensions,
        routes, and accommodations directly with the venue.
      </p>
    </div>
  );
}

function AccessScan() {
  const [buildings, setBuildings] = useState([]);
  const [buildingQuery, setBuildingQuery] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("Loading local building list…");
  const [profile, setProfile] = useState("step-free");
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
      localStorage.setItem("threeDoorsAccessReport", JSON.stringify({
        building: result.building,
        profile: result.profile,
      }));
      setStatus("Location report ready. Review provider status and confirm details with the venue.");
    } catch (error) {
      setStatus(error.message || "The location report could not be created.");
    } finally {
      setBusy(false);
    }
  }

  function resetReport() {
    setReport(null);
    setStatus("");
  }

  return (
    <div className="access-workspace">
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
    </div>
  );
}

function App() {
  const [selectedTool, setSelectedTool] = useState(null);
  const [showPageLoader, setShowPageLoader] = useState(true);

  useEffect(() => {
    const loaderTimer = window.setTimeout(() => setShowPageLoader(false), 800);
    return () => window.clearTimeout(loaderTimer);
  }, []);

  function returnHome() {
    setSelectedTool(null);
    setShowPageLoader(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setShowPageLoader(false), 800);
  }

  const tools = [
  {
  id: "access",
  icon: "◎",
  title: "Access Scan",
  description: "Explore accessibility details before your visit.",
},
{
  id: "medication",
  icon: "✚",
  title: "Medication Label Reader",
  description: "Make medication labels easier to understand.",
},
{
  id: "journal",
  icon: "▤",
  title: "Symptom & Food Journal",
  description: "Organize observations for your next appointment.",
},
{
  id: "packet",
  icon: "📄",
  title: "Build Visit Packet",
  description:
    "Bring your accessibility information, medication details, and symptom history together in one printable summary.",
},

  ];
   // Read saved information for the dashboard
  const clinicAddress =
    localStorage.getItem("threeDoorsClinicAddress") || "";

  const readSavedData = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  };

  const accessItems = readSavedData("threeDoorsAccessChecklist");
  const accessReport = readSavedData("threeDoorsAccessReport");
  const journalEntries = readSavedData("threeDoorsJournal");
  const medicationResults = readSavedData("threeDoorsMedication");

  const accessReviewed = Array.isArray(accessItems)
    ? accessItems.length
    : 0;

  const journalCount = Array.isArray(journalEntries)
    ? journalEntries.length
    : 0;

  const hasMedicationResults = Boolean(
    medicationResults?.originalText ||
    medicationResults?.explanation
  );

  const accessStarted = Boolean(accessReport?.building || clinicAddress || accessReviewed > 0);
  const medicationStarted = hasMedicationResults;
  const journalStarted = journalCount > 0;

  const completedAreas = [
    accessStarted,
    medicationStarted,
    journalStarted,
  ].filter(Boolean).length;

  const progressPercent = Math.round(
    (completedAreas / 3) * 100
  );

  return (
    <div className={`app${selectedTool?.id === "access" ? " app-access" : ""}`}>
      {showPageLoader && (
        <div className="page-loader" role="status" aria-live="polite">
          <span className="page-loader-mark" aria-hidden="true">✦</span>
          <span className="page-loader-label">Opening Three Doors</span>
        </div>
      )}
      <header className="navbar">
        <button
          className="brand"
          onClick={returnHome}
        >
          ✦ THREE DOORS
        </button>
        <span className="nav-label">YOUR VISIT, SIMPLIFIED</span>
      </header>

      {selectedTool === null ? (
        <main>
          <section className="welcome">
  <div className="hero-layout">

    <div className="hero-content">
      <div className="logo">A BETTER WAY TO PREPARE</div>

      <h1>
        Healthcare should
        <br />
        <span className="hero-highlight">
          open doors.
        </span>
        <br />
        Not close them.
      </h1>

      <p>
        Meet your smarter appointment companion.
        Check accessibility, understand medication
        labels, and organize your symptoms — all
        in one calming space designed around you.
      </p>

      <a className="explore-button" href="#tools">
        Explore Three Doors →
      </a>

      <div className="hero-pillars">
        <div className="hero-pillar">
          <span className="hero-pillar-icon">◎</span>
          <span>Access</span>
        </div>

        <div className="hero-pillar">
          <span className="hero-pillar-icon">✚</span>
          <span>Clarity</span>
        </div>

        <div className="hero-pillar">
          <span className="hero-pillar-icon">✎</span>
          <span>Advocacy</span>
        </div>
      </div>
    </div>

    <div className="hero-artwork">
  <img
    src="/images/three-doors-illustration.png"
    alt="Hand-drawn illustration of an open doorway with healthcare doodles"
    className="hero-illustration"
  />

  <span className="sparkle sparkle-one" aria-hidden="true">✦</span>
  <span className="sparkle sparkle-two" aria-hidden="true">✧</span>
  <span className="sparkle sparkle-three" aria-hidden="true">✦</span>
</div>

  </div>
<div className="hero-dashboard">
  <div className="dashboard-topbar">
    <span className="dashboard-brand">✦ THREE DOORS</span>
    <span className="dashboard-demo">MY WORKSPACE</span>
  </div>

  <div className="dashboard-heading">
    <span>YOUR APPOINTMENT WORKSPACE</span>
    <h3>Ready for your next visit?</h3>
    <p>
      Everything you need to prepare for your healthcare
      appointment, thoughtfully organized in one place.
    </p>
  </div>

  <div className="dashboard-appointment">
    <div>
      <span className="dashboard-appointment-label">
        APPOINTMENT PREPARATION
      </span>
      <h4>Your visit, organized.</h4>
      <p>
        {completedAreas === 3
          ? "All three preparation areas have activity. Your visit packet brings everything together."
          : `${completedAreas} of 3 preparation areas have been started. Continue whenever you're ready.`}
      </p>
    </div>

    <span className="dashboard-appointment-icon">✦</span>
  </div>

  <div className="dashboard-preview-grid">
    <div className="dashboard-preview-card dashboard-access">
      <span className="dashboard-preview-icon">◎</span>
      <strong>Accessibility</strong>
      <span className="dashboard-status">
        {accessReviewed === 5
          ? "Checklist reviewed"
          : accessReviewed > 0
          ? `${accessReviewed} of 5 reviewed`
          : accessReport?.building
          ? "Report generated"
          : clinicAddress
          ? "Address saved"
          : "Not started"}
      </span>
    </div>

    <div className="dashboard-preview-card dashboard-medication">
      <span className="dashboard-preview-icon">✚</span>
      <strong>Medication</strong>
      <span className="dashboard-status">
        {hasMedicationResults
          ? "Results saved"
          : "Awaiting analysis"}
      </span>
    </div>

    <div className="dashboard-preview-card dashboard-journal">
      <span className="dashboard-preview-icon">✎</span>
      <strong>Journal</strong>
      <span className="dashboard-status">
        {journalCount > 0
          ? `${journalCount} saved entries`
          : "Ready to start"}
      </span>
    </div>
  </div>

  <div className="dashboard-progress">
    <div className="dashboard-progress-header">
      <strong>Your preparation progress</strong>
      <span>{progressPercent}%</span>
    </div>

    <div className="dashboard-progress-track">
      <div
        className="dashboard-progress-fill"
        style={{ width: `${progressPercent}%` }}
      />
    </div>

    <p>
      Your accessibility details, medication information,
      and journal entries can be organized in your Visit Packet.
    </p>
  </div>

  <div className="dashboard-preview-footer">
    <span>✦ YOUR VISIT, SIMPLIFIED</span>
    <span>THREE DOORS / YOUR WORKSPACE</span>
  </div>
</div>
          </section>

          <div className="scrapbook-divider" aria-hidden="true">
            <span className="divider-flower">✿</span>
            <span className="divider-star">✦</span>
            <span className="divider-flower divider-flower-blue">❀</span>
            <span className="divider-star divider-star-green">✧</span>
            <span className="divider-flower divider-flower-yellow">✿</span>
          </div>

          <section id="tools" className="tools-section">
            <div className="section-heading">
              <div className="logo">EXPLORE OUR TOOLS</div>
              <h2 className="tools-editorial-title">
                Three doors. <span>One better visit.</span>
              </h2>
              <p>Choose a tool to begin preparing.</p>
            </div>


        <div className="tool-grid">
  {tools
    .map((tool, index) => (
      <button
        key={tool.id}
        className={`tool-card tool-card-${tool.id}`}
        onClick={() => setSelectedTool(tool)}
      >
        <span className="card-number">
          0{index + 1} / 04
        </span>

        <div className="card-artwork">
          {tool.id === "access" ? (
            <img src="/images/accessscan-illustration.png" alt="" className="card-illustration" />
          ) : tool.id === "medication" ? (
            <img src="/images/medication-illustration.png" alt="" className="card-illustration" />
          ) : tool.id === "journal" ? (
            <img src="/images/journal-illustration.png" alt="" className="card-illustration" />
          ) : tool.id === "packet" ? (
            <img src="/images/visit-packet-illustration.png" alt="" className="card-illustration" />
          ) : (
            <span className="card-icon">{tool.icon}</span>
          )}
        </div>

        <h3>{tool.title}</h3>
        <p>{tool.description}</p>

        <span className="card-link">
          Explore tool →
        </span>
      </button>
    ))}
</div>
                <button
                  className="packet-feature"
                  onClick={() => setSelectedTool(tools.find((tool) => tool.id === "packet"))}
                >
                  <span className="packet-feature-icon">✦</span>

                  <span className="packet-feature-content">
                    <span className="packet-feature-label">
                      YOUR FINAL STEP
                    </span>
                    <strong>Everything together. One visit packet.</strong>
                    <span>
                      Bring your accessibility details, medication information,
                      and symptom history together in one printable summary.
                    </span>
                  </span>

                  <span className="packet-feature-link">
                    Build Visit Packet →
                  </span>
                 </button>
          </section>

          {/* Patient journey — editorial section */}
          <section className="journey-section">
            <div className="journey-heading">
              <span className="journey-eyebrow">
                ✦ THE THREE DOORS EXPERIENCE
              </span>

              <h2>
                A little more clarity.
                <br />
                <em>A lot more confidence.</em>
              </h2>

              <p>
                From preparing for your appointment to bringing
                everything together, we're here to make the
                process feel simpler.
              </p>
            </div>

            <div className="journey-steps">
              <div className="journey-step">
                <span className="journey-number">01</span>
                <span className="journey-symbol">✳</span>
                <h3>Prepare</h3>
                <p>Explore accessibility and get ready for your visit.</p>
              </div>

              <div className="journey-step">
                <span className="journey-number">02</span>
                <span className="journey-symbol">✦</span>
                <h3>Understand</h3>
                <p>Make sense of medication labels and track how you feel.</p>
              </div>

              <div className="journey-step">
                <span className="journey-number">03</span>
                <span className="journey-symbol">♡</span>
                <h3>Organize</h3>
                <p>Bring your information together in one visit packet.</p>
              </div>
            </div>
          </section>

        </main>
      ) : (
        <main className={`tool-page${selectedTool.id === "access" ? " access-workspace-shell" : ""}`}>
          <button
            className="back-button"
            onClick={() => setSelectedTool(null)}
          >
            ← Back to Home
          </button>


        {!["medication", "access", "journal", "packet"].includes(selectedTool.id) && (
          <>
            <div className="logo">THREE DOORS / YOUR TOOLS</div>
            <h1>{selectedTool.title}</h1>
            <p>{selectedTool.description}</p>
          </>
        )}

        {selectedTool.id === "medication" ? (
          <MedicationReader />
        ) : selectedTool.id === "access" ? (
          <AccessScan />
        ) : selectedTool.id === "journal" ? (
          <SymptomJournal />
        ) : selectedTool.id === "packet" ? (
          <VisitPacket />
        ) : (
          <div className="coming-soon">
            <h2>Your workspace is ready.</h2>
            <p>Your team's feature will be connected here.</p>
          </div>
        )}

        </main>
      )}


      <footer className="site-footer">
        Designed to make healthcare feel more human.
      </footer>
    </div>
  );
}

export default App;
