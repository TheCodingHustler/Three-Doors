const connections = new WeakMap();

export function connectFrame(api, frame, key) {
  if (!connections.has(frame)) {
    const connection = Promise.resolve().then(() => api.connect(frame, key, ""));
    connections.set(frame, connection);
    connection.catch(() => { if (connections.get(frame) === connection) connections.delete(frame); });
  }
  return connections.get(frame);
}

export function safeErrorDetail(error, key) {
  let detail = typeof error === "string" ? error : error?.message;
  if (typeof detail !== "string" || !detail.trim()) detail = "Matterport did not provide an error description.";
  for (const secret of [key, encodeURIComponent(key || "")]) {
    if (secret) detail = detail.split(secret).join("[redacted]");
  }
  detail = detail.replace(/(?:https?:\/\/)[^\s<>"']+/g, "[URL]");
  return detail.slice(0, 350);
}

export function connectionError(error, key, origin) {
  return `SDK connection failed on ${origin}: ${safeErrorDetail(error, key)}`;
}
