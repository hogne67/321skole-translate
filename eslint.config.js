// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  /* =========================
     Global ignores
  ========================= */
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/dist/**",
      "**/coverage/**",

      // Legacy / archive
      "_archive_producer_old/**",
      "_archive/**",

      // Scripts / tools
      "scripts/**",

      // Debug
      "app/_debug/**",
      "app/debug/**",
      "_debug/**",
      "debug/**",
    ],
  },

  /* =========================
     Base JS + TS rules
  ========================= */
  js.configs.recommended,
  ...tseslint.configs.recommended,

  /* =========================
     Next.js (app directory)
  ========================= */
  {
    files: ["app/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": next,
    },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
    },
  },

  /* =========================
     React Hooks (app + components)
  ========================= */
  {
    files: [
      "app/**/*.{js,jsx,ts,tsx}",
      "components/**/*.{js,jsx,ts,tsx}",
    ],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // Core hooks rules (these MUST be defined explicitly)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Too strict / noisy for real-world React + Firebase
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },

  /* =========================
     TypeScript project rules
  ========================= */
  {
    files: [
      "app/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  /* =========================
     Server / config exceptions
  ========================= */
  {
    files: [
      "**/*.cjs",
      "**/*.config.{js,ts}",
      "lib/firebaseAdmin.ts",
      "lib/**/server*.ts",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];