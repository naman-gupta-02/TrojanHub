// Design tokens shared by mobile and web (ARCHITECTURE.md §8).
// Cardinal only for primary actions. Targets: WCAG AA contrast, 44px tap targets.

export const colors = {
  cardinal: "#990000", // primary actions
  cardinalDark: "#7A0000", // pressed / hover
  gold: "#FFCC00", // highlights, badges (use dark text on gold)
  ink: "#1A1A1A", // body text
  muted: "#5C5C5C", // secondary text (AA on white)
  line: "#E2E2E2", // borders
  surface: "#FFFFFF",
  background: "#F7F5F2",
  success: "#1E7B34",
  warning: "#8A5A00",
  danger: "#B00020",
  // tier / urgency chips
  valuable: "#990000",
  everyday: "#3B5B7A",
  safety: "#B00020",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28 } as const;
export const minTapTarget = 44;

export const theme = { colors, spacing, radius, fontSize, minTapTarget } as const;
export type Theme = typeof theme;
