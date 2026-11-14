import { useState } from "react";
import MedicationReader from "./MedicationReader";
import "./App.css";

function App() {
  const [selectedTool, setSelectedTool] = useState(null);

  const tools = [
    {
      id: "access",
      icon: "♿",
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
      icon: "✎",
      title: "Symptom & Food Journal",
      description: "Organize observations for your next appointment.",
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
            <div className="logo">A BETTER WAY TO PREPARE</div>

            <h1>
              Better care begins
              <br />
              before your visit.
            </h1>

            <p>
              One thoughtful space to prepare, organize,
              and feel confident about your next appointment.
            </p>

            <a className="explore-button" href="#tools">
              Explore Three Doors →
            </a>
          </section>

          <section id="tools" className="tools-section">
            <div className="section-heading">
              <div className="logo">EXPLORE OUR TOOLS</div>
              <h2>Three doors. One better visit.</h2>
              <p>Choose a tool to begin preparing.</p>
            </div>

            <div className="tool-grid">
              {tools.map((tool, index) => (
                <button
                  key={tool.id}
                  className="tool-card"
                  onClick={() => setSelectedTool(tool)}
                >
                  <span className="card-number">
                    0{index + 1} / 03
                  </span>

                  <span className="card-icon">{tool.icon}</span>

                  <h3>{tool.title}</h3>
                  <p>{tool.description}</p>

                  <span className="card-link">
                    Explore tool →
                  </span>
                </button>
              ))}
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

          
        {selectedTool.id !== "medication" && (
          <>
            <div className="logo">THREE DOORS / YOUR TOOLS</div>
            <h1>{selectedTool.title}</h1>
            <p>{selectedTool.description}</p>
          </>
        )} 

          
{selectedTool.id === "medication" ? (
  <MedicationReader />
) : (
        <div className="coming-soon">
          <span className="card-icon">{selectedTool.icon}</span>
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