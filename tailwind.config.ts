import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  corePlugins: {
    preflight: false, // 🔥 dette er nøkkelen
  },
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;