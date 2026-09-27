import { ESLint } from "eslint";

// Use this project's legacy configuration, even inside a parent flat-config workspace.
const eslint = new ESLint({ useEslintrc: false, overrideConfigFile: ".eslintrc.cjs" });
const results = await eslint.lintFiles([
  "src/**/*.{ts,tsx}",
  "tests/**/*.{ts,tsx}",
  "e2e/**/*.ts",
  "*.{js,cjs,ts}",
]);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);
if (output) process.stdout.write(output);
process.exitCode = results.some((result) => result.errorCount || result.warningCount) ? 1 : 0;
