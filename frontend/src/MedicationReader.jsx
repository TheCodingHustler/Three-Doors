
import { useRef, useState } from "react";
import "./MedicationReader.css";

function MedicationReader() {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [explanation, setExplanation] = useState("");
  function saveMedicationResults(labelText, plainExplanation) {
    setOriginalText(labelText);
    setExplanation(plainExplanation);

    localStorage.setItem(
      "threeDoorsMedication",
      JSON.stringify({
        originalText: labelText,
        explanation: plainExplanation,
      })
    );
  }



function processFile(selectedFile) {
  if (!selectedFile) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(selectedFile.type)) {
    alert("Please upload a JPG, PNG, or WebP image.");
    return;
  }

  // Limit uploads to 10 MB.
  if (selectedFile.size > 10 * 1024 * 1024) {
    alert("Please choose an image smaller than 10 MB.");
    return;
  }

  setFile(selectedFile);

  const reader = new FileReader();

  reader.onload = () => {
    setPreview(reader.result);
  };

  reader.readAsDataURL(selectedFile);
}

function handleFileChange(event) {
  processFile(event.target.files[0]);
}

function handleDrop(event) {
  event.preventDefault();
  setIsDragging(false);

  const droppedFile = event.dataTransfer.files[0];
  processFile(droppedFile);
}

  return (
    <div className="med-dashboard">
      <div className="med-header">
        <div>
          <span className="med-eyebrow">
            THREE DOORS / MEDICATION WORKSPACE
          </span>
          <h2 className="medication-editorial-title">
            Medication Label <span>Reader</span>
          </h2>
          <p>
            A clearer way to review your medication
            information before your next appointment.
          </p>
         </div>

        <img
          src="/images/medication-header.png?v=2"
          alt=""
          className="med-header-illustration"
        />

        <span className="med-status">● Ready to upload</span>
      </div>

      <div className="med-grid">
        <section className="med-panel">
          <div className="med-panel-heading">
            <span className="med-step">01 / UPLOAD</span>
            <h3>Your medication label</h3>
            <p>
              Choose a clear photo of your medication label.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />


            <div
            className={`med-upload-zone ${isDragging ? "dragging" : ""}`}
            onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
            }}
            onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
            }}
            onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
            }}
            onDrop={handleDrop}
            >

            {preview ? (
              <img
                src={preview}
                alt="Selected medication label"
                className="med-preview"
              />
            ) : (
              <>
                <div className="med-upload-icon">↑</div>
                <h4>Upload your label</h4>
                <p>JPG, PNG, or WebP · Maximum 10 MB</p>
              </>
            )}

            <button
              className="med-upload-button"
              onClick={() => fileInputRef.current.click()}
            >
              {file ? "Change Image" : "Choose Image"}
            </button>
            {file && (
            <button
                type="button"
                className="med-analyze-button"
                disabled
                title="Analysis will be available once OCR is connected"
            >
                <span>✦</span> Analyze Label
                <span>→</span>
            </button>
            )}

          </div>

          {file && (
            <p className="med-file-name">
              ✓ Selected: {file.name}
            </p>
          )}
        </section>

        <section className="med-panel">
          <div className="med-panel-heading">
            <span className="med-step">02 / REVIEW</span>
            <h3>Label analysis</h3>
            <p>
              Your original label text and explanation
              will appear here.
            </p>
          </div>

          <div className="med-result">
            <div className="med-result-title">
              <span>Original Label Text</span>
              <span className="med-tag">OCR</span>
            </div>
          <div className="med-result-content">
            {originalText || "Awaiting label analysis..."}
          </div>
          </div>

          <div className="med-result">
            <div className="med-result-title">
              <span>Plain-Language Explanation</span>
              <span className="med-tag">SUMMARY</span>
            </div>
            <div className="med-result-content">
              {explanation ||
                "Your explanation will appear here after the label has been processed."}
            </div>
          </div>

          <div className="med-review-note">
            <strong>Important:</strong> If text is unclear,
            confirm it with a pharmacist or clinician.
            This tool does not provide dosing advice.
          </div>
        </section>
      </div>

      <div className="med-bottom-bar">
        <span>✦ Designed for clarity and confidence.</span>
        <span>THREE DOORS © 2026</span>
      </div>
    </div>
  );
}

export default MedicationReader;