/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // 'class' (explicit toggle) instead of the default 'media' (auto system-detect) — 'media' makes
  // NativeWind's web runtime try to imperatively react to prefers-color-scheme changes, which
  // throws ("Cannot manually set color scheme, as dark mode is type 'media'") since this app has
  // no dark theme implemented yet to toggle into. Revisit this once a real dark mode is built.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Pulled directly from the web app's tokens (client/src/index.css)
        // light-theme values, so both clients read as the same product.
        primary: {
          50: "#f0f4f8",
          100: "#dbe4f0",
          200: "#bacce2",
          300: "#8daed2",
          400: "#618abd",
          500: "#426a9f",
          600: "#2c4b77",
          700: "#213e6a", // Sharp Brand Navy
          800: "#1d3558",
          900: "#0f2240", // Midnight Navy
        },
        surface: "#ffffff",
        "surface-hover": "#eef2f6",
        "surface-active": "#e1e7ef",
        border: "#e1e7ef",
        "border-hover": "#cbd6e2",
        text: "#0b1626",
        "text-secondary": "#364a63",
        "text-muted": "#64748b",
        "text-light": "#94a3b8",
      },
    },
  },
  plugins: [],
};
