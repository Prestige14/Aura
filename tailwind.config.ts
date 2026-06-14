import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        aura: {
          bg: "#070B12",
          surface: "#0D1221",
          card: "#111827",
          border: "#1E2D47",
          accent: "#6C63FF",
          "accent-glow": "#8B5CF6",
          cyan: "#06B6D4",
          emerald: "#10B981",
          amber: "#F59E0B",
          rose: "#F43F5E",
          text: "#E2E8F0",
          muted: "#64748B",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "aura-gradient": "linear-gradient(135deg, #6C63FF 0%, #06B6D4 100%)",
        "dark-mesh": "radial-gradient(at 40% 20%, #1a0533 0px, transparent 50%), radial-gradient(at 80% 0%, #0c1a3d 0px, transparent 50%), radial-gradient(at 0% 50%, #05111f 0px, transparent 50%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.5s ease-out",
        "spin-slow": "spin 3s linear infinite",
        "bounce-dot": "bounceDot 1.4s infinite ease-in-out both",
        "shimmer": "shimmer 2s linear infinite",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px #6C63FF, 0 0 10px #6C63FF" },
          "100%": { boxShadow: "0 0 10px #6C63FF, 0 0 25px #6C63FF, 0 0 50px #6C63FF40" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        bounceDot: {
          "0%, 80%, 100%": { transform: "scale(0)", opacity: "0.5" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      boxShadow: {
        "aura": "0 0 20px rgba(108, 99, 255, 0.3)",
        "card": "0 4px 24px rgba(0, 0, 0, 0.4)",
        "glow-sm": "0 0 10px rgba(108, 99, 255, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
