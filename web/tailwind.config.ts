import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca" },
      },
    },
  },
  plugins: [],
};
export default config;
