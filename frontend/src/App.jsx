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
    <span className="dashboard-demo">DEMO WORKSPACE</span>
  </div>

  <div className="dashboard-heading">
    <span>YOUR APPOINTMENT WORKSPACE</span>
    <h3>Ready for your next visit?</h3>
    <p>Keep the important details together before your appointment.</p>
  </div>

  <div className="dashboard-appointment">
    <div>
      <span className="dashboard-appointment-label">
        APPOINTMENT PREPARATION
      </span>
      <h4>Your visit, organized.</h4>
      <p>Start with any tool and build your visit packet.</p>
    </div>
    <span className="dashboard-appointment-icon">✦</span>
  </div>

  <div className="dashboard-preview-grid">
    <div className="dashboard-preview-card dashboard-access">
      <span className="dashboard-preview-icon">◎</span>
      <strong>Accessibility</strong>
      <span className="dashboard-status">Not reviewed</span>
    </div>

    <div className="dashboard-preview-card dashboard-medication">
      <span className="dashboard-preview-icon">✚</span>
      <strong>Medication</strong>
      <span className="dashboard-status">Not uploaded</span>
    </div>

    <div className="dashboard-preview-card dashboard-journal">
      <span className="dashboard-preview-icon">✎</span>
      <strong>Journal</strong>
      <span className="dashboard-status">Ready to start</span>
    </div>
  </div>

  <div className="dashboard-progress">
    <div className="dashboard-progress-header">
      <strong>Visit preparation</strong>
      <span>EXAMPLE WORKSPACE</span>
    </div>

    <div className="dashboard-progress-track">
      <div className="dashboard-progress-fill"></div>
    </div>

    <p>
      Your accessibility details, medication information,
      and journal entries will come together in your visit packet.
    </p>
  </div>

  <div className="dashboard-preview-footer">
    <span>✦ YOUR VISIT, SIMPLIFIED</span>
    <span>THREE DOORS / PREVIEW</span>
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
    .filter((tool) => tool.id !== "packet")
    .map((tool, index) => (
      <button
        key={tool.id}
        className="tool-card"
        onClick={() => setSelectedTool(tool)}
      >
        <span className="card-number">
          0{index + 1} / 04
        </span>

        <span className="card-icon">
          {tool.icon}
        </span>

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