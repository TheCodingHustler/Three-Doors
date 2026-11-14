import { useState } from "react";
import MedicationReader from "./MedicationReader";
import AccessScan from "./AccessScan";
import "./App.css";
import SymptomJournal from "./SymptomJournal";
import VisitPacket from "./VisitPacket";

function App() {
  const [selectedTool, setSelectedTool] = useState(null);

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

  const accessStarted = Boolean(clinicAddress || accessReviewed > 0);
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
    <div className="app">
      <header className="navbar">
        <button
          className="brand"
          onClick={() => setSelectedTool(null)}
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

          <section id="tools" className="tools-section">
            <div className="section-heading">
              <div className="logo">EXPLORE OUR TOOLS</div>
              <h2>Three doors. One better visit.</h2>
              <p>Choose a tool to begin preparing.</p>
            </div>

            
        <div className="tool-grid">
  {tools
    .map((tool, index) => (
      <button
        key={tool.id}
        className="tool-card"
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
        <main className="tool-page">
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