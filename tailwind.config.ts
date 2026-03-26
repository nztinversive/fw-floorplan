import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        fw: {
          navy: "#1B2A4A",
          amber: "#D4A84B",
          cream: "#FAF7F2",
          slate: "#64748B"
        }
      }
    }
  },
  plugins: []
};

export default config;
