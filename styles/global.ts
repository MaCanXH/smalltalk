import { StyleSheet } from "react-native";

/**
 * Global design tokens. The app is dark-theme-first; only the accent colour is
 * user-configurable (see Settings + ThemeContext).
 */

export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: "Ocean", value: "#2F80FF" },
  { name: "Violet", value: "#7C5CFF" },
  { name: "Mint", value: "#2FD08B" },
  { name: "Coral", value: "#FF5C8A" },
  { name: "Amber", value: "#FF9F1C" },
  { name: "Teal", value: "#25C2C2" },
];

export const DEFAULT_ACCENT = ACCENT_PRESETS[0].value;

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textDim: string;
  textFaint: string;
  border: string;
  accent: string;
  accentSoft: string;
  danger: string;
  success: string;
}

/** Build the full colour set from a chosen accent. */
export function makeColors(accent: string): ThemeColors {
  return {
    bg: "#0A0C10",
    surface: "#14181F",
    surfaceAlt: "#1C222B",
    text: "#F3F5F8",
    textDim: "#9AA4B2",
    textFaint: "#5B6471",
    border: "#262D38",
    accent,
    accentSoft: accent + "22",
    danger: "#FF5C5C",
    success: "#2FD08B",
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 30, fontWeight: "800" as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.3 },
  h3: { fontSize: 17, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "500" as const },
  small: { fontSize: 13, fontWeight: "500" as const },
  tiny: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.4 },
};

/** Layout helpers that don't depend on the dynamic accent. */
export const layout = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fill: {
    flex: 1,
  },
});
