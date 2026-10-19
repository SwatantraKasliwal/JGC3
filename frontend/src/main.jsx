import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { applyTextSize, readTextSize } from "./lib/textSize.js";
import "./index.css";

// Before the first render, so a chosen text size never shows as a jump.
applyTextSize(readTextSize());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
