import { useEffect, useMemo, useRef, useState } from "react";
import MedicationReader from "./features/labels/Medications.jsx";
import SymptomJournal from "./SymptomJournal.jsx";
import VisitPacket from "./VisitPacket.jsx";
import "./App.css";

import RouteReview from "./RouteReview.jsx";
import MatterportWalkthrough from "./MatterportWalkthrough.jsx";
import { barrierImpact } from "./barrierImpact.js";
import { profiles, readVisitReport, saveVisitReport, visitQuestions } from "./visitReport.js";

function EvidenceImage({ image, findings = [] }) {
  const [unavailable, setUnavailable] = useState(false);
  return (
    <figure className="audit-evidence-image">
      {unavailable ? <p>Image unavailable. Run the location report again to refresh evidence.</p>
        : <div className="barrier-image-stage">
            <img src={image.url} alt={image.title} loading="lazy" onError={() => setUnavailable(true)} />
            <svg className="barrier-image-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Possible barrier locations">
              {findings.map(({ box_2d: box, title, detail }, index) => (
                Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) &&
                box.every((value) => value >= 0 && value <= 1000) && box[0] < box[2] && box[1] < box[3] && (
                  <ellipse key={index} cx={(box[1] + box[3]) / 2} cy={(box[0] + box[2]) / 2}
                    rx={(box[3] - box[1]) / 2} ry={(box[2] - box[0]) / 2}>
                    <title>{title}: {detail}</title>
                  </ellipse>
                )
              ))}
            </svg>
          </div>}
      <figcaption>{image.title}</figcaption>
    </figure>
  );
}

function Findings({ items, evidence, profile, onShow, showPhotos = false }) {
  return (
    <ul className="report-findings">
      {items.map(({ title, detail, impact, box_2d, preparedMarkerId, evidence: id }, index) => (
        <li key={`${id}-${index}`}>
          <strong>{title}</strong>
          {showPhotos && (
            <details className="barrier-help">
              <summary aria-label={`How ${title.toLowerCase()} could affect your visit`}>
                <span aria-hidden="true">?</span>
              </summary>
              <div className="barrier-help-content">
                <strong>How this could affect your visit</strong>
                {barrierImpact({ title, detail, impact }, profile).map((explanation) => (
                  <p key={explanation}>{explanation}</p>
                ))}
                <p className="barrier-help-note">Ask staff how this affects the entrance or rooms you plan to use, and whether an alternative or assistance is available.</p>
              </div>
            </details>
          )}
          <p>{detail}</p>
          {onShow && <button type="button" className="text-action" onClick={() => onShow({ title, detail, impact, preparedMarkerId, evidence: id })}>{preparedMarkerId ? "Show in walkthrough" : "Open source scan"}</button>}
          {showPhotos && evidence.has(id) && (
            <details>
              <summary>{id === "aerial" ? "See arrival feature location" : "See barrier location"}</summary>
              <EvidenceImage image={evidence.get(id)} findings={[{ title, detail, box_2d }]} />
              <p className="barrier-location-note">{box_2d ? `Red outline: AI-identified ${id === "aerial" ? "arrival feature" : "possible barrier"}. Location is approximate.` : "A precise location could not be identified in this image."}</p>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function Report({ report, onReset, onOpenPacket }) {
  const [candidate, setCandidate] = useState(report.candidate);
  const [walkthroughRequest, setWalkthroughRequest] = useState(null);
  const [saveError, setSaveError] = useState("");
  const evidence = useMemo(() => new Map(report.evidence.map((item) => [item.id, item])), [report.evidence]);
  const aerial = evidence.get("aerial");
  const indoorFindings = useMemo(() => report.ai.observations.filter((item) => item.evidence !== "aerial" && evidence.has(item.evidence)), [report.ai.observations, evidence]);
  const outdoorFindings = report.ai.observations.filter((item) => item.evidence === "aerial");
  const activeProfile = profiles.find((item) => item.id === report.profile)?.title;
  const questions = visitQuestions(report);

  function save() {
    try {
      saveVisitReport(report, candidate);
    } catch {
      setSaveError("The Visit Packet could not be saved in this browser.");
      return;
    }
    onOpenPacket();
  }

  return (
    <div className="report-stack">
      <section className="report-intro">
        <div>
          <h2>{report.demo ? "Sample medical office" : report.clinicName || report.building}</h2>
          {report.demo ? <p>Guided demo · Example floor plan and route</p>
            : report.clinicName && <p>{report.address}</p>}
          <p>Planning for {activeProfile?.toLowerCase()}</p>
        </div>
        <button className="text-action" onClick={onReset} type="button">Start over</button>
      </section>

      {report.matterport?.viewerUrl && (
        <MatterportWalkthrough key={`${report.matterport.modelId}.${report.profile}`}
          matterport={report.matterport} evidence={evidence}
          profile={report.profile} request={walkthroughRequest} prepared={report.preparedWalkthrough} />
      )}

      {!report.demo && (
        <>
          <section className="clinic-findings" aria-labelledby="clinic-findings-heading">
            <h3 id="clinic-findings-heading">Possible barriers inside</h3>
            <details className="barrier-help barrier-section-help">
              <summary aria-label="What possible barriers inside means"><span aria-hidden="true">?</span></summary>
              <div className="barrier-help-content">
                <strong>What could this mean for you?</strong>
                <p>A barrier is a feature that could make entering, moving around, or finding your way harder for your selected access needs.</p>
                <ul>
                  <li>Steps or raised thresholds could stop wheelchair wheels or make a level entrance necessary.</li>
                  <li>Tight turns, furniture, or narrow passages could leave less room to move with a wheelchair or walker.</li>
                  <li>Glare, low contrast, or hard-to-read signs could make doors, obstacles, and directions harder to see.</li>
                  <li>Limited seating or obstacles could mean more time standing or walking before you can rest.</li>
                </ul>
                <p className="barrier-help-note">These are examples, not confirmed conditions at this clinic. Open the ? beside a finding for its specific effect, and confirm details with staff before visiting.</p>
              </div>
            </details>
            {indoorFindings.length > 0 ? <Findings items={indoorFindings} evidence={evidence} profile={report.profile} onShow={(finding) => setWalkthroughRequest({ finding })} showPhotos />
              : <p>{report.ai.reviewed?.includes("Matterport")
                ? "The sampled views didn’t show a clear barrier for your access needs. Check doors, thresholds, and clearances with staff."
                : "An automated review of the clinic photos is unavailable. Check access details with staff."}</p>}
          </section>
          <section className="arrival-evidence" aria-labelledby="arrival-heading">
            <h3 id="arrival-heading">Parking, ramps & getting to the door</h3>
            {aerial && <EvidenceImage image={{ ...aerial, title: "Aerial view of the clinic and surrounding streets" }} findings={outdoorFindings} />}
            {aerial && outdoorFindings.some((item) => item.box_2d) && <p className="barrier-location-note">Red outlines: AI-identified arrival features. Locations are approximate; confirm access with staff.</p>}
            {outdoorFindings.length > 0 ? <Findings items={outdoorFindings} evidence={evidence} profile={report.profile} showPhotos />
              : <p>{report.ai.reviewed?.includes("Vexcel")
                ? "Gemini reviewed this aerial image and did not identify a clear arrival feature to circle. This does not confirm a step-free entrance or accessible parking."
                : "An automated review of the arrival area is unavailable."}</p>}
            <p>Ask staff which parking space or drop-off is closest to the entrance you can use, and whether the path has a curb ramp.</p>
          </section>
        </>
      )}

      <RouteReview report={report} candidate={candidate} onCandidate={setCandidate} />

      <section className="confirm-panel">
        <h3>Ask the clinic before you go</h3>
        <ul>{questions.map((item) => <li key={item}>{item}</li>)}</ul>
        <button type="button" className="action-primary" onClick={save}>
          {report.demo ? "Save example to Visit Packet" : "Save to Visit Packet"}
        </button>
        {saveError && <p role="alert">{saveError}</p>}
      </section>
    </div>
  );
}

function AccessScan({ onOpenPacket }) {
  const [buildings, setBuildings] = useState([]);
  const [buildingQuery, setBuildingQuery] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("Loading local building list…");
  const [profile, setProfile] = useState("step-free");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [report, setReport] = useState(null);
  const results = useRef(null);

  useEffect(() => {
    if (report) results.current?.focus();
  }, [report]);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("clinic");
    if (!target || params.get("profile") !== "step-free") return;
    let active = true;
    const controller = new AbortController();
    setBusy(true); setProfile("step-free"); setStatus("Loading the prepared clinic report…");
    fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ building: target, profile: "step-free" }), signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not open clinic report");
      if (active) { setReport(result); setStatus("Your clinic review is ready."); }
    }).catch((error) => { if (active) setStatus(error.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; controller.abort(); };
  }, []);

  async function showDemo() {
    setBusy(true);
    setStatus("Loading the simulated floor plan…");
    setReport(null);
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
      setStatus("Your clinic review is ready.");
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

      <div className={`audit-layout${report ? " has-report" : ""}`}>
        <section className="med-panel audit-form-panel" hidden={Boolean(report)}>
          <div className="med-panel-heading">
            <span className="med-step">01 / YOUR VISIT</span>
            <h2>Choose a building</h2>
            <p>Search by clinic name or address.</p>
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

        <section className="med-panel results-panel" aria-label="Access review result" ref={results} tabIndex={-1}>
          {report ? (
            <Report report={report} onReset={resetReport} onOpenPacket={onOpenPacket} />
          ) : (
            <div className="empty-report">
              <span className="empty-mark" aria-hidden="true">✦</span>
              <div className="med-step">03 / REVIEW</div>
              <h2>Your review will appear here</h2>
              <p>Choose a clinic to see its walkthrough, possible access barriers, and arrival options.</p>
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
  const [selectedTool, setSelectedTool] = useState(() => new URLSearchParams(window.location.search).has("clinic") ? { id: "access" } : null);
  const workspace = useRef(null);

  useEffect(() => {
    if (selectedTool) workspace.current?.focus();
  }, [selectedTool]);
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
  const accessReport = readVisitReport();
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
        Check the route to your appointment, see what the building evidence shows,
        and bring your questions for staff in a printable Visit Packet.
      </p>

      <button type="button" className="explore-button"
        onClick={() => setSelectedTool(tools.find((tool) => tool.id === "access"))}>
        Start Access Scan →
      </button>

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
          ? "Report saved"
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
        <main ref={workspace} tabIndex={-1} className={`tool-page${selectedTool.id === "access" ? " access-workspace-shell" : ""}`}>
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
          <AccessScan onOpenPacket={() => setSelectedTool(tools.find((tool) => tool.id === "packet"))} />
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
