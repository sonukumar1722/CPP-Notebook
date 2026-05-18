/**
 * main.tsx
 * --------
 * Standard React entry point for Vite applications.
 * Mounts the App component into the DOM and applies global CSS.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
