import { useMemo } from "react";

import { useThemeStore } from "@/stores/themeStore";

/**
 * Resolves a design token to a concrete colour for SVG libraries (Recharts) whose presentation
 * attributes can't use CSS variables. Re-reads whenever the theme flips.
 */
export function useTokenColor(name: string, alpha = 1): string {
  const theme = useThemeStore((s) => s.theme);
  return useMemo(() => {
    void theme;
    const channels = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
    return channels ? `rgb(${channels} / ${alpha})` : "currentColor";
  }, [name, alpha, theme]);
}
