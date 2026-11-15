import { useState } from "react";
import "./VisitPacket.css";
import { profiles, readVisitReport } from "./visitReport.js";

function VisitPacket() {
  // Load saved journal entries
  const [journalEntries] = useState(() => {
    try {
      const savedEntries = localStorage.getItem("threeDoorsJournal");
      const parsed = savedEntries ? JSON.parse(savedEntries) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Load saved appointment questions
  const [questions, setQuestions] = useState(() => {
    try {
      const savedQuestions = localStorage.getItem("threeDoorsQuestions");
      const parsed = savedQuestions ? JSON.parse(savedQuestions) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Store the question currently being typed
  const [newQuestion, setNewQuestion] = useState("");
  const [report] = useState(readVisitReport);
  const [includeJournal, setIncludeJournal] = useState(false);
  const clinicName = report?.address && report.building?.endsWith(` · ${report.address}`)
    ? report.building.slice(0, -report.address.length - 3) : report?.building;
  const routeStops = report?.route?.stops || [report?.route?.start, report?.route?.end].filter(Boolean);
  const accessNeed = profiles.find((profile) => profile.id === report?.profile)?.title;
  const [clinicAddress] = useState(() => {
    return localStorage.getItem("threeDoorsClinicAddress") || "";
  });

  // Print or save the Visit Packet
  function handlePrint() {
    window.print();
  }

  return (
    <div className="packet-dashboard">
      <header className="packet-header">
        <div className="packet-header-content">
          <div className="packet-eyebrow">
            THREE DOORS / APPOINTMENT PREPARATION
          </div>

          <h2 className="packet-editorial-title">
            Your Visit <span>Packet</span>
          </h2>

          <p>
            A clear, organized summary to help you
            prepare for your next healthcare appointment.
          </p>
        </div>
        <img
          src="/images/visit-packet-header.png"
          alt=""
          className="packet-header-illustration"
        />

        <button
          className="packet-print-button"
          onClick={handlePrint}
        >
          Print / Save as PDF
        </button>
      </header>

      <div className="packet-document">
        <div className="packet-document-header">
          <span className="packet-brand">✦ THREE DOORS</span>
          <span className="packet-label">VISIT SUMMARY</span>
        </div>

        <h1>My Visit Packet</h1>

        <p className="packet-intro">
          A personal summary of accessibility needs,
          medication information, and symptoms to discuss.
        </p>

        <div className="packet-section">
          <div className="packet-section-number">01</div>

          <div>
            <h3>Arrival & Accessibility</h3>

            {report?.building ? (
              <>
                <p><strong>{report.demo ? "Guided demo · Sample medical office" : clinicName}</strong></p>
                {!report.demo && report.address && <p>{report.address}</p>}
                {accessNeed && <p>Access need · {accessNeed}</p>}
                {report.demo && <p>Simulated floor plan and route for demonstration.</p>}
                {report.route && <>
                  <p>{report.demo ? "Example route" : "Possible route inside"} · About {report.route.metres} m</p>
                  <ol>{routeStops.map((stop, index) => <li key={index}>{stop}</li>)}</ol>
                  {!report.demo && <p>Confirm the entrance, check-in, and step-free access with staff.</p>}
                </>}
                {report.findings?.length > 0 && (
                  <>
                    <h4>Potential barriers in the captured evidence</h4>
                    <ul>{report.findings.map(({ title, detail, source }, index) => (
                      <li key={index}><strong>{title}.</strong> {detail} {source && <small>({source})</small>}</li>
                    ))}</ul>
                  </>
                )}
                {report.confirmations?.length > 0 && (
                  <>
                    <h4>Questions and checks for venue staff</h4>
                    <ul>{report.confirmations.map((item) => <li key={item}>{item}</li>)}</ul>
                  </>
                )}
              </>
            ) : clinicAddress ? (
              <p>Healthcare facility address · {clinicAddress}</p>
            ) : (
              <p>Save a location report from Access Scan to add it here.</p>
            )}
          </div>
        </div>

        <div className="packet-section">
          <div className="packet-section-number">02</div>

          <div>
            <h3>Medication Information</h3>
            <p>
              Medication label information and
              plain-language explanations will appear here
              after a label has been reviewed.
            </p>
            <span className="packet-pending">
              Awaiting medication review
            </span>
          </div>
        </div>


<div className="packet-section">
  <div className="packet-section-number">03</div>

  <div>
    <h3>Symptom & Food Timeline</h3>

      {journalEntries.length > 0 && (
      <label className="packet-include-journal">
        <input type="checkbox" checked={includeJournal} onChange={(event) => setIncludeJournal(event.target.checked)} />
        Include journal entries in the packet
      </label>
    )}
    {journalEntries.length === 0 && <p>No journal entries have been recorded yet.</p>}
    {includeJournal && journalEntries.length > 0 && (
      <div className="packet-journal-list">
        {[...journalEntries]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((entry) => (
            <div className="packet-journal-entry" key={entry.id}>
              <strong>{entry.date}</strong>

              {entry.symptom && (
                <p>
                  <strong>Symptoms:</strong> {entry.symptom}
                </p>
              )}

              {entry.food && (
                <p>
                  <strong>Food or drink:</strong> {entry.food}
                </p>
              )}

              {entry.symptom && (
                <p>
                  <strong>Intensity:</strong> {entry.severity}
                </p>
              )}

              {entry.notes && (
                <p>
                  <strong>Notes:</strong> {entry.notes}
                </p>
              )}
            </div>
          ))}
      </div>
    )}
  </div>
</div>

        <div className="packet-section">
          <div className="packet-section-number">04</div>

          <div>
            <h3>Questions for My Appointment</h3>

<div className="packet-question-form">
  <input
    type="text"
    placeholder="Type a question for your doctor..."
    value={newQuestion}
    onChange={(event) => setNewQuestion(event.target.value)}
  />

  <button
    type="button"
    onClick={() => {
      if (newQuestion.trim() === "") return;

      const updatedQuestions = [
        ...questions,
        newQuestion.trim()
      ];

      setQuestions(updatedQuestions);

      localStorage.setItem(
        "threeDoorsQuestions",
        JSON.stringify(updatedQuestions)
      );

      setNewQuestion("");
    }}
  >
    Add Question
  </button>
</div>

{questions.length === 0 ? (
  <p>No questions added yet.</p>
) : (
  <ul className="packet-question-list">
    {questions.map((question, index) => (
      <li key={index}>
        <span>{question}</span>

        <button
          type="button"
          className="packet-delete-question"
          onClick={() => {
            const updatedQuestions = questions.filter(
              (_, i) => i !== index
            );

            setQuestions(updatedQuestions);

            localStorage.setItem(
              "threeDoorsQuestions",
              JSON.stringify(updatedQuestions)
            );
          }}
        >
          Remove
        </button>
      </li>
    ))}
  </ul>
)}
          </div>
        </div>

        <div className="packet-disclaimer">
          Three Doors helps organize information for healthcare
          visits. It does not provide medical diagnoses or
          certify building accessibility. Confirm medication
          instructions and accessibility details with qualified
          professionals.
        </div>

        <footer className="packet-document-footer">
          <span>THREE DOORS</span>
          <span>Better care begins before your visit.</span>
        </footer>
      </div>
    </div>
  );
}

export default VisitPacket;