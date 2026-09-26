/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

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
        primary: token("primary"),
        "primary-hover": token("primary-hover"),
        "primary-soft": token("primary-soft"),
        "on-primary": token("on-primary"),
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        ai: token("ai"),
      },
      fontFamily: {
        sans: ['"Geist Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono Variable"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      minHeight: {
        11: "2.75rem",
      },
      transitionDuration: {
        fast: "140ms",
        base: "220ms",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(15 23 32 / 0.04), 0 4px 16px -6px rgb(15 23 32 / 0.08)",
        lift: "0 1px 2px rgb(15 23 32 / 0.05), 0 12px 32px -12px rgb(15 23 32 / 0.18)",
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
