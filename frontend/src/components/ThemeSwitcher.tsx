import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTheme, LIGHT_THEME, DARK_THEME, ColorMode } from "../context/ThemeContext";

export const ThemeSwitcher: React.FC = () => {
  const { mode, setMode, isDark, currentConfig } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const modes = [DARK_THEME, LIGHT_THEME];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="theme-switcher-container" ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="theme-switcher-btn"
        onClick={() => setOpen((prev) => !prev)}
        title="Cambiar Modo Claro / Oscuro"
      >
        <span
          className="theme-swatch-dot"
          style={{
            backgroundColor: currentConfig.previewColors.primary,
            color: currentConfig.previewColors.primary
          }}
        />
        <span>{isDark ? "🌙 Modo Oscuro" : "☀️ Modo Claro"}</span>
        <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div className="theme-dropdown">
          <div style={{ padding: "6px 8px 4px", fontSize: "0.74rem", fontWeight: 700, color: "var(--sidebar-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Seleccionar Modo
          </div>

          {modes.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={`theme-option-item ${mode === m.mode ? "active" : ""}`}
              onClick={() => {
                setMode(m.mode as ColorMode);
                setOpen(false);
              }}
            >
              <div className="theme-preview-pill">
                <span className="theme-preview-dot" style={{ backgroundColor: m.previewColors.bg }} />
                <span className="theme-preview-dot" style={{ backgroundColor: m.previewColors.surface }} />
                <span className="theme-preview-dot" style={{ backgroundColor: m.previewColors.primary }} />
                <span className="theme-preview-dot" style={{ backgroundColor: m.previewColors.accent }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                  {m.icon} {m.name} ({m.mode === "dark" ? "Oscuro" : "Claro"})
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--sidebar-muted)" }}>{m.inspiration}</div>
              </div>
              {mode === m.mode && <span style={{ color: "var(--primary)", fontWeight: 900 }}>✓</span>}
            </button>
          ))}

          <div style={{ borderTop: "1px solid var(--surface-border)", marginTop: 6, paddingTop: 6 }}>
            <Link
              to="/estilos"
              className="theme-option-item"
              onClick={() => setOpen(false)}
              style={{ justifyContent: "center", fontWeight: 700, fontSize: "0.82rem", color: "var(--accent)" }}
            >
              <span>✨ Ver Showcase y Comparador</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
