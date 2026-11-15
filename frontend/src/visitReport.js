const reportKey = "threeDoorsAccessReport";

export function readVisitReport() {
  try {
    return JSON.parse(localStorage.getItem(reportKey));
  } catch {
    return null;
  }
}

export function saveVisitReport(report, candidate) {
  const evidence = new Set(report.evidence.map((image) => image.id));
  const route = candidate && {
    metres: candidate.metres,
    stops: candidate.scan_ids.map((id) => scanLabel(report.geometry, id)),
  };
  const findings = report.ai.observations.filter((item) => evidence.has(item.evidence))
    .map(({ title, detail, evidence: id }) => ({ title, detail, source: id === "aerial" ? "Outside" : "Inside" }));
  localStorage.setItem(reportKey, JSON.stringify({
    building: report.clinicName || report.building, address: report.address,
    profile: report.profile, demo: report.demo, route, findings, confirmations: visitQuestions(report),
  }));
}

export function visitQuestions(report) {
  return [...new Set([...report.confirmations, ...report.ai.confirmations])];
}

export function scanLabel(geometry, id) {
  const index = geometry.scans.findIndex((scan) => scan.id === id);
  const label = geometry.scans[index]?.label;
  if (label && label !== id) return /^\d+$/.test(label) ? `Viewpoint ${label}` : label;
  return index >= 0 ? `Viewpoint ${index + 1}` : "Viewpoint";
}

export const profiles = [
  { id: "step-free", icon: "↗", title: "Step-free & wheelchair access" },
  { id: "low-vision", icon: "◉", title: "Low-vision navigation" },
  { id: "short-walk", icon: "⌁", title: "Short walking distance" },
];
