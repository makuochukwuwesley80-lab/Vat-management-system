import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          200: "#bcdaff",
          300: "#8ec2ff",
          400: "#599fff",
          500: "#337bff",
          600: "#1b5bf5",
          700: "#1443e1",
          800: "#1738b6",
          900: "#19338f",
          950: "#142155",
        },
      },
      boxShadow: {
        glass: "0 8px 32px rgba(20, 42, 96, 0.10)",
        "glass-lg": "0 16px 48px rgba(20, 42, 96, 0.16)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
        "fade-in": "fade-in 0.3s ease-out both",
        "scale-in": "scale-in 0.2s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
