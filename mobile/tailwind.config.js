/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#FF8B33",
          press: "#F27A1F",
          soft: "#FFF2E8",
          deep: "#A9480A",
        },
        surface: {
          DEFAULT: "#1E1612",
          card: "#2C221D",
          border: "rgba(255, 255, 255, 0.08)",
          dim: "#A99A91",
        },
      },
    },
  },
  plugins: [],
};
