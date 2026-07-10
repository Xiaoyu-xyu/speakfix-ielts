import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#132033",
        bamboo: {
          50: "#f3f8ef",
          100: "#e3eedb",
          200: "#c8dfbc",
          300: "#a8ca98",
          400: "#82ad70",
          500: "#63924f",
          600: "#4f7a3d",
          700: "#3f6132",
        },
        calm: "#63924f",
        mist: "#f3f8ef",
      },
      boxShadow: {
        soft: "0 18px 45px rgba(79, 122, 61, 0.13)",
      },
    },
  },
  plugins: [],
};

export default config;
