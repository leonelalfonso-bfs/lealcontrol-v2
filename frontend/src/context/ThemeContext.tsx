import React, { createContext, useContext, useEffect, useState } from "react";

export type ColorMode = "light" | "dark";

export interface ModeConfig {
  mode: ColorMode;
  themeId: string;
  name: string;
  tagline: string;
  inspiration: string;
  icon: string;
  previewColors: {
    bg: string;
    surface: string;
    primary: string;
    accent: string;
    text: string;
  };
}

export const LIGHT_THEME: ModeConfig = {
  mode: "light",
  themeId: "liquid-glass",
  name: "Liquid Glass",
  tagline: "Modo Claro cristalino con desenfoque de fondo y luz especular",
  inspiration: "macOS Sonoma · iOS 18",
  icon: "☀️",
  previewColors: {
    bg: "#eaf0f8",
    surface: "rgba(255, 255, 255, 0.75)",
    primary: "#0d9488",
    accent: "#0284c7",
    text: "#132338"
  }
};

export const DARK_THEME: ModeConfig = {
  mode: "dark",
  themeId: "nordic-slate",
  name: "Nordic Slate",
  tagline: "Modo Oscuro pizarra mate refinada con acentos esmeralda y oro",
  inspiration: "Raycast · Notion · Arc Browser",
  icon: "🌙",
  previewColors: {
    bg: "#10141d",
    surface: "#1a2130",
    primary: "#10b981",
    accent: "#f59e0b",
    text: "#f1f5f9"
  }
};

interface ThemeContextType {
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
  toggleMode: () => void;
  isDark: boolean;
  currentConfig: ModeConfig;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "leal_color_mode_v2";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ColorMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ColorMode | null;
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    return "light";
  });

  const setMode = (newMode: ColorMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
    applyModeToDoc(newMode);
  };

  const toggleMode = () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
  };

  const applyModeToDoc = (m: ColorMode) => {
    const themeId = m === "dark" ? DARK_THEME.themeId : LIGHT_THEME.themeId;
    document.documentElement.setAttribute("data-theme", themeId);
    document.documentElement.setAttribute("data-color-mode", m);
  };

  useEffect(() => {
    applyModeToDoc(mode);
  }, [mode]);

  const currentConfig = mode === "dark" ? DARK_THEME : LIGHT_THEME;

  return (
    <ThemeContext.Provider
      value={{
        mode,
        setMode,
        toggleMode,
        isDark: mode === "dark",
        currentConfig
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
