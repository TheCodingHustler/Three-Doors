import { useState } from "react";
import "./VisitPacket.css";

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
        <div>
          <div className="packet-eyebrow">
            THREE DOORS / APPOINTMENT PREPARATION
          </div>

          <h2>Your Visit Packet</h2>

          <p>
            A clear, organized summary to help you
            prepare for your next healthcare appointment.
          </p>
        </div>

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
            
            {clinicAddress ? (
              <>
                <p>
                  <strong>Healthcare facility address:</strong>
                </p>
                <p>{clinicAddress}</p>

                <span className="packet-pending">
                  Accessibility review not yet completed
                </span>
              </>
            ) : (
              <p>No clinic address has been entered yet.</p>
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

    {journalEntries.length === 0 ? (
      <p>No journal entries have been recorded yet.</p>
    ) : (
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