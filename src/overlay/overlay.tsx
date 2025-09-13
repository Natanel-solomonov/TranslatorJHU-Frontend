import React from "react";
import ReactDOM from "react-dom/client";
import CaptionsOverlay from "./CaptionsOverlay";
import "../styles/overlay.css";

ReactDOM.createRoot(document.getElementById("captions-root")!).render(
  <React.StrictMode>
    <CaptionsOverlay />
  </React.StrictMode>
);
