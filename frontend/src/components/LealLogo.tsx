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
        gap: 12,
        verticalAlign: "middle"
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible", flexShrink: 0 }}
      >
        <defs>
          {/* Emerald Gradient Main */}
          <linearGradient id="lealEmeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="50%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>

          {/* Cyan Glow Accent */}
          <linearGradient id="lealCyanGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>

          {/* Ambient Glow Filter */}
          <filter id="emeraldGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Core Pulse Filter */}
          <filter id="coreGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <style>{`
          @keyframes pulseAura {
            0%, 100% { transform: scale(1); opacity: 0.75; }
            50% { transform: scale(1.06); opacity: 1; }
          }
          @keyframes rotateRing {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes dashFlow {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: 200; }
          }
          @keyframes floatLogo {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-2px); }
          }
          .leal-animated-aura {
            transform-origin: 50% 50%;
            animation: ${animated ? "pulseAura 3.5s ease-in-out infinite" : "none"};
          }
          .leal-animated-ring {
            transform-origin: 50% 50%;
            animation: ${animated ? "rotateRing 24s linear infinite" : "none"};
          }
          .leal-animated-path {
            stroke-dasharray: 120;
            animation: ${animated ? "dashFlow 6s linear infinite" : "none"};
          }
          .leal-animated-float {
            animation: ${animated ? "floatLogo 4s ease-in-out infinite" : "none"};
          }
        `}</style>

        {/* Outer Frosted Glass Hex/Circle Container */}
        <rect
          x="6"
          y="6"
          width="88"
          height="88"
          rx="24"
          fill="rgba(16, 185, 129, 0.1)"
          stroke="url(#lealEmeraldGrad)"
          strokeWidth="2"
          strokeOpacity="0.45"
        />

        {/* Ambient Pulsing Aura */}
        <circle
          cx="50"
          cy="50"
          r="36"
          fill="rgba(16, 185, 129, 0.14)"
          filter="url(#emeraldGlow)"
          className="leal-animated-aura"
        />

        {/* Orbit Control Ring (Rotating Dashed Orbit) */}
        <circle
          cx="50"
          cy="50"
          r="36"
          fill="none"
          stroke="url(#lealCyanGrad)"
          strokeWidth="1.5"
          strokeDasharray="8 12"
          opacity="0.65"
          className="leal-animated-ring"
        />

        {/* Central Geometric Monogram "L" + "C" Intersected */}
        <g className="leal-animated-float">
          {/* Main "L" Geometry (Emerald Solid) */}
          <path
            d="M28 26 C28 23.79 29.79 22 32 22 H36 C38.21 22 40 23.79 40 26 V60 H66 C68.21 60 70 61.79 70 64 V68 C70 70.21 68.21 72 66 72 H32 C29.79 72 28 70.21 28 68 V26 Z"
            fill="url(#lealEmeraldGrad)"
            filter="url(#emeraldGlow)"
          />

          {/* Overlapping "C" Control Loop (Upper Right Arc) */}
          <path
            d="M50 32 C62 32 72 40 72 52 C72 54.21 70.21 56 68 56 C65.79 56 64 54.21 64 52 C64 44.27 57.73 38 50 38 C42.27 38 36 44.27 36 52 C36 54.21 34.21 56 32 56 C29.79 56 28 54.21 28 52 C28 40 38 32 50 32 Z"
            fill="url(#lealCyanGrad)"
            opacity="0.95"
          />

          {/* Dynamic Control Node / Core Orb (Center Glowing Point) */}
          <circle
            cx="66"
            cy="36"
            r="6.5"
            fill="#34d399"
            filter="url(#coreGlow)"
          />
          <circle cx="66" cy="36" r="3" fill="#ffffff" />
        </g>
      </svg>

      {showText && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontWeight: 900, fontSize: "1.15rem", color: "var(--ink)", letterSpacing: "-0.02em" }}>
              LEAL
            </span>
            <span
              style={{
                fontSize: "0.74rem",
                fontWeight: 800,
                padding: "2px 7px",
                borderRadius: 7,
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#ffffff",
                boxShadow: "0 2px 10px rgba(16, 185, 129, 0.4)",
                letterSpacing: "0.04em"
              }}
            >
              v2.0
            </span>
          </div>
          <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--ink-soft)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Control ERP
          </span>
        </div>
      )}
    </div>
  );
};
