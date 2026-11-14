
import { useEffect, useState } from "react";
import "./SymptomJournal.css";

function SymptomJournal() {
  const [entries, setEntries] = useState(() => {
  try {
    const savedEntries = localStorage.getItem("threeDoorsJournal");
    return savedEntries ? JSON.parse(savedEntries) : [];
  } catch {
    return [];
  }
    });
    useEffect(() => {
  localStorage.setItem("threeDoorsJournal", JSON.stringify(entries));
}, [entries]);
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-CA")
  );
  const [symptom, setSymptom] = useState("");
  const [food, setFood] = useState("");
  const [severity, setSeverity] = useState("Mild");
  const [notes, setNotes] = useState("");

  function handleAddEntry(event) {
    event.preventDefault();

    if (!symptom.trim() && !food.trim()) {
      alert("Please enter a symptom or food.");
      return;
    }

    const newEntry = {
      id: crypto.randomUUID(),
      date,
      symptom: symptom.trim(),
      food: food.trim(),
      severity,
      notes: notes.trim(),
    };

    setEntries((previous) => [newEntry, ...previous]);

    setSymptom("");
    setFood("");
    setSeverity("Mild");
    setNotes("");
  }

  function handleDeleteEntry(id) {
    setEntries((previous) =>
      previous.filter((entry) => entry.id !== id)
    );
  }

  return (
    <div className="journal-dashboard">
      <header className="journal-header">
        <div>
          <div className="journal-eyebrow">
            THREE DOORS / PERSONAL HEALTH JOURNAL
          </div>

          <h2 className="journal-editorial-title">
              Symptom & Food <span>Journal</span>
            </h2>

          <p>
            Keep track of what you experience and what you eat,
            so you can discuss patterns with your healthcare team.
          </p>
         </div>

        <img
          src="/images/journal-header.png?v=2"
          alt=""
          className="journal-header-illustration"
        />

        <span className="journal-status">
          ● Ready to record
        </span>
      </header>

      <div className="journal-grid">
        <section className="journal-panel">
          <div className="journal-step">01 / NEW ENTRY</div>

          <h3>Record your day</h3>

          <p className="journal-description">
            Add a few details about your symptoms, meals,
            or anything you'd like to remember.
          </p>

          <form onSubmit={handleAddEntry} className="journal-form">
            <label htmlFor="journal-date">Date</label>
            <input
              id="journal-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />

            <label htmlFor="journal-symptom">Symptoms</label>
            <input
              id="journal-symptom"
              type="text"
              placeholder="e.g. Headache, nausea, fatigue"
              value={symptom}
              onChange={(event) => setSymptom(event.target.value)}
            />

            <label htmlFor="journal-food">Food or drink</label>
            <input
              id="journal-food"
              type="text"
              placeholder="e.g. Oatmeal, tea, sandwich"
              value={food}
              onChange={(event) => setFood(event.target.value)}
            />

            <label htmlFor="journal-severity">
              Symptom intensity
            </label>
            <select
              id="journal-severity"
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              <option value="Mild">Mild</option>
              <option value="Moderate">Moderate</option>
              <option value="Severe">Severe</option>
              <option value="Not applicable">Not applicable</option>
            </select>

            <label htmlFor="journal-notes">Additional notes</label>
            <textarea
              id="journal-notes"
              placeholder="Anything else you want to remember?"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows="4"
            />

            <button type="submit" className="journal-save-button">
              + Save Journal Entry
            </button>
          </form>
        </section>

        <section className="journal-panel">
          <div className="journal-step">02 / YOUR TIMELINE</div>

          <div className="journal-timeline-header">
            <h3>Recent entries</h3>
            <span className="journal-count">
              {entries.length} entries
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="journal-empty">
              <div className="journal-empty-icon">✎</div>
              <h4>Your story starts here</h4>
              <p>
                Your journal entries will appear here
                once you save your first one.
              </p>
            </div>
          ) : (
            <div className="journal-timeline">
              {entries.map((entry) => (
                <article className="journal-entry" key={entry.id}>
                  <div className="journal-entry-top">
                    <span className="journal-entry-date">
                      {entry.date}
                    </span>

                    <button
                      type="button"
                      className="journal-delete"
                      onClick={() => handleDeleteEntry(entry.id)}
                      aria-label={`Delete entry from ${entry.date}`}
                    >
                      Delete
                    </button>
                  </div>

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
                    <span className="journal-severity">
                      {entry.severity} intensity
                    </span>
                  )}

                  {entry.notes && (
                    <p className="journal-entry-notes">
                      {entry.notes}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}

          <div className="journal-notice">
            <strong>For your visit:</strong> This journal is a
            personal record, not a diagnosis. Discuss concerning
            symptoms with a qualified healthcare professional.
          </div>
        </section>
      </div>

      <div className="journal-footer">
        Small details can help make healthcare conversations clearer.
      </div>
    </div>
  );
}

export default SymptomJournal;