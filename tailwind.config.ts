import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#0f0f10",
        panel: "#171718",
        panelAlt: "#1f2021",
        border: "#2a2b2c",
        accent: "#10a37f",
        accentHover: "#0e8f6f",
        textPrimary: "#ececec",
        textMuted: "#9b9b9b",
      },
      fontFamily: {
        sans: ["Söhne", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
