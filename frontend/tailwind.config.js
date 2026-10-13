/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — The Plinth
        navy: {
          50:  '#eef1f7',
          100: '#d5dced',
          200: '#aab8db',
          300: '#7e94c9',
          400: '#5271b7',
          500: '#2e4fa0',
          600: '#1e3a8a', // primary
          700: '#162d6e',
          800: '#0e2052',
          900: '#071236',
          950: '#040b23',
        },
        cream: {
          50:  '#fefdf8',
          100: '#fdf9ee',
          200: '#faf2d6',   // primary cream
          300: '#f5e8b8',
          400: '#efdb97',
          500: '#e8cc74',
        },
        gold: {
          300: '#fcd34d',
          400: '#f59e0b',
          500: '#d97706', // primary gold/amber accent
          600: '#b45309',
        },
        // Semantic
        success: '#16a34a',
        warning: '#d97706',
        danger:  '#dc2626',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 2px 8px rgba(7, 18, 54, 0.08)',
        'card-hover': '0 8px 24px rgba(7, 18, 54, 0.14)',
        'nav': '0 1px 4px rgba(7, 18, 54, 0.1)',
      },
    },
  },
  plugins: [],
};
