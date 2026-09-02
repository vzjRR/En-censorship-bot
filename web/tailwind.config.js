/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f1115",
          raised: "#151821",
          border: "#242836",
        },
        accent: {
          DEFAULT: "#5865f2",
          hover: "#4752c4",
        },
        danger: "#ed4245",
        warn: "#faa61a",
        ok: "#3ba55d",
      },
    },
  },
  plugins: [],
};
