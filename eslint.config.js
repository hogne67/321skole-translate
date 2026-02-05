// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  // Global ignores (erstatter .eslintignore)
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/dist/**",
      "**/coverage/**",

      // Legacy/arkiv
      "_archive_producer_old/**",
      "_archive/**",

      // Scripts/tools
      "scripts/**",

      // Debug
      "app/_debug/**",
      "app/debug/**",
      "_debug/**",
      "debug/**",
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  // Next.js rules for app code only
  {
    files: ["app/**/*.{js,jsx,ts,tsx}"],
    plugins: { "@next/next": next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
    },
  },

  // React hooks rules (keep the important ones, disable the too-strict ones)
  {
    files: ["app/**/*.{js,jsx,ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // ✅ These two are the ones spamming you with "purity" + "setState in effect"
      // They are too strict for typical React + Firebase patterns.
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },

  // TypeScript tweaks: keep strictness but avoid MVP pain (you can later narrow this per-folder if needed)
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Allow require in config-like/server-only files (optional safety)
  {
    files: ["**/*.cjs", "**/*.config.{js,ts}", "lib/firebaseAdmin.ts", "lib/**/server*.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
