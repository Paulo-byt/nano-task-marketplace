import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // k6 load-test scripts (load-tests/k6/**) run in k6's own JS runtime
    // (goja), not Node/the browser -- they use k6-specific globals
    // (__ENV, __VU, open) and import from "k6/http", which this project's
    // TypeScript/Next.js ESLint rules have no context for.
    "load-tests/k6/**",
  ]),
]);

export default eslintConfig;
