import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./context/AuthContext";
import { PermissionsProvider } from "./context/PermissionsContext";
import { ThemeProvider } from "./context/ThemeContext";
import { DocumentTemplateProvider } from "./context/DocumentTemplateContext";
import { PresentationModeProvider } from "./context/PresentationModeContext";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <PermissionsProvider>
        <PresentationModeProvider>
          <ThemeProvider>
            <DocumentTemplateProvider>
              <App />
            </DocumentTemplateProvider>
          </ThemeProvider>
        </PresentationModeProvider>
        </PermissionsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
