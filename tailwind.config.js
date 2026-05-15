/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#7C6EE6',
          50:  '#F4F2FE',
          100: '#EEEBfd',
          200: '#DDD9FB',
          600: '#7C6EE6',
          800: '#4A3E9A',
        },
        child: {
          purple: '#7C6EE6',
          teal:   '#26B99A',
          coral:  '#E86B5F',
          amber:  '#E8A838',
        },
        success: '#26B99A',
        warning: '#E8A838',
        danger:  '#E24B4A',
      },
      fontFamily: {
        sans:  ['DM Sans', 'system-ui', 'sans-serif'],
        serif: ['DM Serif Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

