import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Import Google Fonts

ReactDOM.createRoot(document.getElementById("root")!).render(
  // StrictMode runs your components twice in development to catch side effects
  // It's removed automatically in production builds
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
