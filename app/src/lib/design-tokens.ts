// ============================================================
// 终末地 (Terminal) Design System — Design Tokens
// ============================================================

// --- Colors ---
export const colors = {
  // Primary accent
  yellow: "#fffa00",
  yellowBg: "rgba(255, 250, 0, 0.08)",
  yellowGlow: "0 0 20px rgba(255, 250, 0, 0.35)",
  yellowGlowStrong: "0 0 32px rgba(255, 250, 0, 0.5)",

  // Secondary accents
  teal: "#4ECDC4",
  green: "#00C853",
  greenPulse: "rgba(0, 200, 83, 0.4)",

  // Neutrals
  white: "#FFFFFF",
  bgSecondary: "#F5F5F5",
  dark: "#141414",
  dark2: "#1a1a1a",
  textMuted: "#6b6b6b",
  gray: "#9E9E9E",

  // Borders & shadows
  border: "rgba(0, 0, 0, 0.10)",
  shadow: "0 2px 16px rgba(0, 0, 0, 0.04)",
  shadowHover: "0 4px 24px rgba(0, 0, 0, 0.06)",
} as const;

// --- Typography ---
export const fonts = {
  mono: "'Courier New', Courier, monospace",
  sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
} as const;

// --- Spacing ---
export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  "2xl": "48px",
  "3xl": "64px",
} as const;

// --- Border Radius ---
export const radius = {
  none: "0",
} as const;

// --- Transitions ---
export const transition = {
  default: "0.28s cubic-bezier(0.16, 1, 0.3, 1)",
  fast: "0.15s cubic-bezier(0.16, 1, 0.3, 1)",
  slow: "0.4s cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

// --- Rarity Stripe Colors ---
export const rarityColors = {
  gold: "#fffa00",
  teal: "#4ECDC4",
  gray: "#9E9E9E",
} as const;

// --- Z-Index ---
export const zIndex = {
  base: 0,
  card: 1,
  nav: 10,
  overlay: 100,
  modal: 200,
} as const;

// Convenience re-export of the full token set
const designTokens = {
  colors,
  fonts,
  spacing,
  radius,
  transition,
  rarityColors,
  zIndex,
} as const;

export default designTokens;
