import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Parses the real design tokens out of globals.css so the guard can never drift from the CSS. */
const css = readFileSync(resolve(__dirname, "../../src/styles/globals.css"), "utf8");

function block(selector: RegExp): Record<string, string> {
  const body = css.match(selector)?.[1] ?? "";
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const root = block(/:root\s*\{([^}]*)\}/);
const darkOverrides = block(/\.dark\s*\{([^}]*)\}/);

type RGB = [number, number, number];

function theme(name: "light" | "dark") {
  const vars = name === "light" ? root : { ...root, ...darkOverrides };
  const resolveToken = (key: string): RGB => {
    let value = vars[`color-${key}`];
    const alias = value?.match(/^var\(--(color-[a-z0-9-]+)\)$/);
    if (alias) value = vars[alias[1]];
    if (!value || !/^\d+ \d+ \d+$/.test(value))
      throw new Error(`token ${key} is not an RGB triplet: ${value}`);
    return value.split(" ").map(Number) as RGB;
  };
  return resolveToken;
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg: RGB, alpha: number, bg: RGB) =>
  fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB;

describe.each(["light", "dark"] as const)("%s theme meets WCAG 2.1 AA", (mode) => {
  const t = theme(mode);
  const surfaces = ["bg", "surface", "surface-2"] as const;

  it.each(surfaces)("text and muted text are readable on %s (4.5:1)", (s) => {
    expect(ratio(t("text"), t(s))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t("muted"), t(s))).toBeGreaterThanOrEqual(4.5);
  });

  it("muted text is readable on the soft teal fill", () => {
    expect(ratio(t("muted"), t("primary-soft"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["primary", "ai", "success", "warning", "danger", "gold"])(
    "%s text is readable on every surface and on its own 10 % tint",
    (name) => {
      for (const s of surfaces) {
        expect(ratio(t(name), t(s))).toBeGreaterThanOrEqual(4.5);
        if (name !== "gold")
          expect(ratio(t(name), over(t(name), 0.1, t(s)))).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("primary text is readable on the soft teal fill", () => {
    expect(ratio(t("primary"), t("primary-soft"))).toBeGreaterThanOrEqual(4.5);
  });

  it("text on solid fills is readable (buttons, AI gradient, avatar)", () => {
    expect(ratio(t("on-primary"), t("primary"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t("on-danger"), t("danger"))).toBeGreaterThanOrEqual(4.5);
    // The AI gradient runs violet -> teal, so on-ai must read on both ends.
    expect(ratio(t("on-ai"), t("ai"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t("on-ai"), t("primary"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(surfaces)(
    "input borders and the focus colour are visible on %s (3:1, WCAG 1.4.11)",
    (s) => {
      expect(ratio(t("field"), t(s))).toBeGreaterThanOrEqual(3);
      expect(ratio(t("primary"), t(s))).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("token table", () => {
  it("defines the new elevation scale, glows and fluid type steps", () => {
    for (const key of [
      "shadow-sm",
      "shadow-md",
      "shadow-lg",
      "shadow-xl",
      "shadow-panel",
      "shadow-glow-primary",
      "shadow-glow-ai",
    ]) {
      expect(root[key], key).toBeTruthy();
    }
    for (const key of [
      "text-hero",
      "text-title",
      "text-section",
      "text-heading",
      "text-lead",
      "text-card",
    ]) {
      expect(root[key], key).toMatch(/^clamp\(/);
    }
  });

  it("every elevation step stacks two shadows", () => {
    for (const key of ["shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"]) {
      expect(root[key].split(/,\s*(?=\d)/).length, key).toBe(2);
    }
  });
});
