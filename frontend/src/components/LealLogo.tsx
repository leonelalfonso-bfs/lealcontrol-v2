import React from "react";

interface LealLogoProps {
  size?: number;
  showText?: boolean;
  animated?: boolean;
  className?: string;
}

export const LealLogo: React.FC<LealLogoProps> = ({
  size = 42,
  showText = false,
  animated = true,
  className = ""
}) => {
  return (
    <div
      className={`leal-logo-wrapper ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        verticalAlign: "middle"
      }}
    >
      <img
        src="/logo.png"
        alt="LEAL Control ERP"
        style={{
          width: showText ? size * 1.05 : size,
          height: showText ? size * 1.05 : size,
          objectFit: "contain",
          borderRadius: "8px",
          filter: animated ? "drop-shadow(0 2px 8px rgba(16, 185, 129, 0.25))" : undefined,
          transition: "transform 0.2s ease"
        }}
      />

      {showText && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 900, fontSize: "1.12rem", color: "var(--logo-title-color, var(--ink))", letterSpacing: "-0.02em" }}>
              LEAL
            </span>
            <span className="t-small t-strong"
              style={{ padding: "2px 6px", borderRadius: 6, background: "linear-gradient(135deg, var(--lc-ok), var(--lc-ok))", color: "#fff", boxShadow: "0 2px 8px rgba(16, 185, 129, 0.35)", letterSpacing: "0.04em" }}
            >
              v2.0
            </span>
          </div>
          <span className="t-small t-strong t-caps" style={{ color: "var(--logo-subtitle-color, var(--ink-soft))", letterSpacing: "0.06em" }}>
            Control ERP
          </span>
        </div>
      )}
    </div>
  );
};
