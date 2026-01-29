/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'avalon-blue': '#1e40af',
        'avalon-red': '#dc2626',
        'avalon-gold': '#d97706',
      },
    },
  },
  plugins: [],
}
