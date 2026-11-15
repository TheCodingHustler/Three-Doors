import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import PrepareClinic from "./PrepareClinic.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get("prepare") === "houston-step-free" ? <PrepareClinic /> : <App />}
  </StrictMode>,
);
