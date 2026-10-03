/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** A fluid text step: size comes from a clamp() token, plus its own leading/tracking/weight. */
const fluid = (name, lineHeight, letterSpacing, fontWeight) => [
  `var(--text-${name})`,
  { lineHeight, letterSpacing, fontWeight },
];

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        text: token("text"),
        muted: token("muted"),
        border: token("border"),
        "border-strong": token("border-strong"),
        field: token("field"),
        primary: token("primary"),
        "primary-hover": token("primary-hover"),
        "primary-soft": token("primary-soft"),
        "on-primary": token("on-primary"),
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        "on-danger": token("on-danger"),
        ai: token("ai"),
        "on-ai": token("on-ai"),
        scrim: token("scrim"),
        highlight: token("highlight"),
        info: token("info"),
        scenario: token("scenario"),
        gold: token("gold"),
        silver: token("silver"),
        bronze: token("bronze"),
        elevated: token("elevated"),
        floating: token("floating"),
      },
      fontFamily: {
        sans: ['"Geist Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono Variable"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        hero: fluid("hero", "1.04", "-0.03em", "600"),
        title: fluid("title", "1.1", "-0.022em", "600"),
        section: fluid("section", "1.12", "-0.022em", "600"),
        heading: fluid("heading", "1.15", "-0.02em", "600"),
        lead: fluid("lead", "1.6", "0", "400"),
        card: fluid("card", "1.35", "-0.01em", "600"),
      },
      spacing: {
        section: "var(--space-section)",
        stack: "var(--space-stack)",
        gutter: "var(--space-gutter)",
        pad: "var(--space-pad)",
      },
      height: {
        "control-sm": "var(--control-sm)",
        control: "var(--control-md)",
        "control-lg": "var(--control-lg)",
      },
      minHeight: {
        11: "2.75rem",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      /* Elevation scale (see globals.css). `soft`/`lift` are kept as aliases of sm/lg. */
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        soft: "var(--shadow-sm)",
        lift: "var(--shadow-lg)",
        panel: "var(--shadow-panel)",
        floating: "var(--shadow-floating)",
        "glow-primary": "var(--shadow-glow-primary)",
        "glow-ai": "var(--shadow-glow-ai)",
        "glow-line": "var(--shadow-glow-line)",
        keycap: "var(--shadow-keycap)",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "grow-x": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
      },
      animation: {
        rise: "rise 420ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 220ms ease-out both",
        "scale-in": "scale-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "grow-x": "grow-x 700ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
