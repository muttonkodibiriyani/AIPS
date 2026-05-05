import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1221",
        surface: "#0f172a",
        mist: "#e8eef6",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      backgroundImage: {
        "hero-radial":
          "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(16,185,129,0.22), transparent 55%), radial-gradient(ellipse 60% 50% at 100% 0%, rgba(59,130,246,0.12), transparent 45%), radial-gradient(ellipse 55% 40% at 0% 0%, rgba(245,158,11,0.1), transparent 40%)",
        "mesh-dark":
          "linear-gradient(180deg, rgba(15,23,42,1) 0%, rgba(11,18,33,1) 100%)",
      },
      boxShadow: {
        glow: "0 0 80px -20px rgba(16,185,129,0.45)",
      },
      animation: {
        "fade-up": "fadeUp 0.6s ease-out forwards",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
