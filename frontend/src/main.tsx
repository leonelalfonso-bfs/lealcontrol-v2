import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import "./glass-tokens.css";
import "./styles.css";
import "./design-tokens.css";
import "./v1-theme.css";
import "./excel-tools.css";
import "./themes.css";
import "./brand-layout.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
