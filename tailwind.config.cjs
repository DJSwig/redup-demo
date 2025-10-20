/** @type {import('tailwindcss').Config} */
module.exports = {
  // Use class-based dark mode so you can toggle via <html class="dark">
  darkMode: "class",

  // Scan your EJS views, route-driven UI strings, and client JS
  content: [
    "./src/views/**/*.ejs",
    "./src/routes/**/*.{js,ts}",
    "./src/public/js/**/*.js"
  ],

  // Keep common utilities when class names are generated dynamically
  safelist: [
    { pattern: /(bg|text|border)-(red|slate|zinc|indigo|emerald|rose)-(50|100|200|300|400|500|600|700|800|900)/ },
    { pattern: /(from|via|to)-(red|slate|indigo|emerald|rose)-(400|500|600)/ },
    { pattern: /(grid-cols|col-span|row-span)-(1|2|3|4|5|6|7|8|9|10|11|12)/ },
    "hidden", "block", "inline-block", "flex"
  ],

  theme: {
    // Nice centered container with sensible padding
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1.25rem",
        lg: "2rem",
        xl: "3rem",
        "2xl": "4rem"
      }
    },

    extend: {
      fontFamily: {
        inter: ["Inter", "sans-serif"],
        space: ["Space Grotesk", "sans-serif"],
      },
      colors: {
        accent: "#ef4444", // brand red
        dark: "#0f172a",   // deep slate
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

  // Add official plugins later (typography/forms/aspect-ratio) after installing:
  // npm i -D @tailwindcss/typography @tailwindcss/forms @tailwindcss/aspect-ratio
  plugins: [
    // require("@tailwindcss/typography"),
    // require("@tailwindcss/forms"),
    // require("@tailwindcss/aspect-ratio"),
  ],
};
