/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs",
    "./public/js/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ["Inter", "sans-serif"],
        space: ["Space Grotesk", "sans-serif"],
      },
      colors: {
        accent: "#ef4444", // main brand red
        dark: "#0f172a",   // slate-950 fallback
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(circle at 20% 20%, rgba(239,68,68,0.25), transparent 40%), radial-gradient(circle at 80% 80%, rgba(239,68,68,0.15), transparent 50%)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(239,68,68,0.4)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: 0.8, filter: "drop-shadow(0 0 10px rgba(239,68,68,0.6))" },
          "50%": { opacity: 1, filter: "drop-shadow(0 0 18px rgba(239,68,68,0.8))" },
        },
      },
      animation: {
        float: "float 4s ease-in-out infinite",
        pulseGlow: "pulseGlow 2.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
