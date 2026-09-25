import React from "react";
import { useTheme } from "../context/ThemeContext";

export const ThemeToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { mode, toggleMode, isDark, currentConfig } = useTheme();

  return (
    <button
      type="button"
      className="theme-mode-toggle-btn"
      onClick={toggleMode}
      title={isDark ? "Cambiar a modo claro LEAL" : "Cambiar a modo oscuro"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: compact ? "6px 10px" : "6px 14px",
        borderRadius: 14,
        background: isDark
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(255, 255, 255, 0.08)",
        border: isDark
          ? "1px solid rgba(255, 255, 255, 0.14)"
          : "1px solid rgba(255, 255, 255, 0.14)",
        color: "var(--sidebar-text)",
        fontSize: "0.85rem",
        fontWeight: 700,
        cursor: "pointer",
        transition: "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        boxShadow: isDark
          ? "0 2px 8px rgba(0, 0, 0, 0.3)"
          : "0 2px 8px rgba(0, 0, 0, 0.05)"
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: 8,
          background: isDark
            ? "rgba(16, 185, 129, 0.2)"
            : "rgba(79, 149, 143, 0.22)",
          color: isDark ? "#34d399" : "#8bd3c9",
          fontSize: "0.95rem"
        }}
      >
        {isDark ? "🌙" : "☀️"}
      </span>

      {!compact && (
        <span style={{ letterSpacing: "-0.01em" }}>
          {isDark ? "Modo Oscuro" : "Modo Claro"}
        </span>
      )}
    </button>
  );
};
