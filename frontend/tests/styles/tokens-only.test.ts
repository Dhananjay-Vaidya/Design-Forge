import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Invariant: components use semantic tokens only, never raw colours or ad-hoc shadows. */
const SRC = resolve(__dirname, "../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}

const files = ["components", "features", "pages", "app", "lib"].flatMap((d) => walk(join(SRC, d)));

const RAW: [string, RegExp][] = [
  ["hex colour", /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g],
  ["raw rgb()/hsl() literal", /\b(rgba?|hsla?)\(\s*\d/g],
  ["white/black utility", /\b(text|bg|border|from|via|to|ring|fill|stroke)-(white|black)\b/g],
  ["arbitrary shadow", /\bshadow-\[/g],
  ["arbitrary colour", /\b(bg|text|border|from|via|to)-\[(#|rgb|hsl)/g],
];

describe("tokens only", () => {
  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(RAW)("no %s in components", (_label, pattern) => {
    const hits: string[] = [];
    for (const file of files) {
      // Anchors such as href="#features" are not colours; strip string-literal anchors first.
      const text = readFileSync(file, "utf8").replace(/["'`]#[a-z][a-z-]*["'`]/g, '""');
      for (const m of text.matchAll(pattern)) hits.push(`${file.slice(SRC.length + 1)}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });
});
