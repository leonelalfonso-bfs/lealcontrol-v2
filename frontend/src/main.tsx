import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { DocumentTemplateProvider } from "./context/DocumentTemplateContext";
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
      <AuthProvider>
        <ThemeProvider>
          <DocumentTemplateProvider>
            <App />
          </DocumentTemplateProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
