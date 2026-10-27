/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          950: '#0A0A0A',
          900: '#111111',
          700: '#3F3F46',
          500: '#71717A',
          400: '#A1A1AA',
          200: '#E4E4E7',
          100: '#F4F4F5',
          50: '#FAFAFA',
        },
        up: {
          DEFAULT: '#15803D',
          soft: '#F0FDF4',
          border: '#BBF7D0',
        },
        down: {
          DEFAULT: '#B91C1C',
          soft: '#FEF2F2',
          border: '#FECACA',
        },
      },
    },
  },
  plugins: [],
};
