/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        desk: '#dde2e8',
        chrome: '#f4f6f8',
        ink: '#17202e',
        'ink-soft': '#566176',
        rule: '#cfd5de',
        accent: '#2f5bea',
        'accent-soft': '#e6ecfd',
        guide: '#d6336c',
      },
      fontFamily: {
        ui: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
