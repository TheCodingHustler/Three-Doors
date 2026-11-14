
import { useRef, useState } from "react";
import "./AccessScan.css";

function AccessScan() {
  const [clinicAddress, setClinicAddress] = useState(() => {
  return localStorage.getItem("threeDoorsClinicAddress") || "";
  });
  const fileInputRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [checkedItems, setCheckedItems] = useState(() => {
  try {
    return JSON.parse(
      localStorage.getItem("threeDoorsAccessChecklist")
    ) || [];
  } catch {
    return [];
  }
});

  const checklist = [
    "Step-free entrance",
    "Wheelchair-accessible pathways",
    "Clear directional signage",
    "Accessible parking",
    "Elevator or ramp access",
  ];
  function toggleChecklistItem(item) {
  setCheckedItems((previous) => {
    const updated = previous.includes(item)
      ? previous.filter((entry) => entry !== item)
      : [...previous, item];

    localStorage.setItem(
      "threeDoorsAccessChecklist",
      JSON.stringify(updated)
    );

    return updated;
  });
}

  function handleFile(event) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) return;

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        selectedFile.type
      )
    ) {
      setError("Please choose a JPG, PNG, or WebP image.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("Please choose an image under 10 MB.");
      return;
    }

    setError("");
    setPhoto(selectedFile);

    const reader = new FileReader();

    reader.onload = () => {
      setPreview(reader.result);
    };

    reader.readAsDataURL(selectedFile);
  }

  return (
    <div className="access-dashboard">
      <div className="access-header">
        <div>
          <div className="access-eyebrow">
            THREE DOORS / ACCESSIBILITY WORKSPACE
          </div>

          <div className="access-title-row">
              <h2 className="access-editorial-title">
                Access <span>Scan</span>
              </h2>

              <img
                src="/images/access-clinic.png?v=2"
                alt=""
                className="access-title-illustration"
              />
            </div>

            <div className="access-address-section">
               <div className="access-address-eyebrow">
                  YOUR DESTINATION
                </div>
            <label htmlFor="clinic-address">Clinic Address</label>

            <input
                id="clinic-address"
                type="text"
                placeholder="Enter clinic street address"
                value={clinicAddress}
                onChange={(event) => {
                  const address = event.target.value;
                  setClinicAddress(address);
                  localStorage.setItem("threeDoorsClinicAddress", address);
                }}
            />

            <p>
                Enter the address of the healthcare facility
                you want to check for accessibility.
            </p>
            </div>

          <p>
            Prepare for your visit by reviewing accessibility
            features at your healthcare location.
          </p>
        </div>

        <span className="access-status">
          ● Ready to upload
        </span>
      </div>

      <div className="access-grid">
        <section className="access-panel">
          <div className="access-step">01 / UPLOAD</div>

          <h3>Clinic photo</h3>

          <p>
            Upload a photo of an entrance, hallway,
            parking area, or other clinic space.
          </p>

          <div className="access-upload-zone">
            {preview ? (
              <img
                src={preview}
                alt="Uploaded clinic preview"
                className="access-preview"
              />
            ) : (
              <>
                <div className="access-upload-icon">⌁</div>
                <h4>Your clinic photo goes here</h4>
                <p>JPG, PNG, or WebP · Maximum 10 MB</p>
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFile}
              style={{ display: "none" }}
            />

            <button
              type="button"
              className="access-upload-button"
              onClick={() => fileInputRef.current?.click()}
            >
              {photo ? "Change Photo" : "Choose Photo"}
            </button>
          </div>

          {error && (
            <p className="access-error" role="alert">
              {error}
            </p>
          )}

          {photo && (
            <p className="access-filename">
              ✓ Selected: {photo.name}
            </p>
          )}

          <button
            type="button"
            className="access-analyze-button"
            disabled
            title="Analysis will be available when the scanner is connected"
          >
            ✦ Review Accessibility →
          </button>
        </section>

        <section className="access-panel">
          <div className="access-step">02 / REVIEW</div>

          <h3>Accessibility checklist</h3>

          <p>
            These are features you may want to confirm
            before your appointment.
          </p>

          <div className="access-progress">
  <div className="access-progress-label">
    <strong>Review progress</strong>
    <span>
      {checkedItems.length} of {checklist.length} reviewed
    </span>
  </div>

  <div className="access-progress-track">
    <div
      className="access-progress-fill"
      style={{
        width: `${(checkedItems.length / checklist.length) * 100}%`
      }}
    />
  </div>
</div>

<div className="access-checklist">
  {checklist.map((item) => {
    const isChecked = checkedItems.includes(item);

    return (
      <label
        className={`access-check-item ${isChecked ? "is-checked" : ""}`}
        key={item}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggleChecklistItem(item)}
        />

        <span>{item}</span>

        <span className="access-check-status">
          {isChecked ? "Reviewed" : "Not reviewed"}
        </span>
      </label>
    );
  })}
</div>

          <div className="access-note">
            <strong>Important:</strong> A photo cannot confirm
            every accessibility feature. Contact the clinic
            directly to verify accommodations before your visit.
          </div>
        </section>
      </div>

      <div className="access-footer">
        Designed to make every visit more accessible.
      </div>
    </div>
  );
}

export default AccessScan;