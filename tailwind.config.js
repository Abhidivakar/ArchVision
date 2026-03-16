/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-space-grotesk)", "var(--font-inter)", "system-ui"],
      },
      colors: {
        background: "#020817",
        surface: "#0d1526",
        "surface-2": "#162035",
        border: "#1e2d4a",
        accent: "#3b82f6",
        "accent-glow": "#60a5fa",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "ping-slow": "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "float": "float 6s ease-in-out infinite",
        "slide-up": "slideUp 0.5s ease-out",
        "fade-in": "fadeIn 0.4s ease-out",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px #3b82f6, 0 0 20px #3b82f640" },
          "100%": { boxShadow: "0 0 10px #3b82f6, 0 0 40px #3b82f680" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
