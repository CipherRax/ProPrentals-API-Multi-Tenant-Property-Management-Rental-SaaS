import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d4d9e1',
          300: '#aeb7c5',
          400: '#8390a3',
          500: '#637187',
          600: '#4e5a6f',
          700: '#40495b',
          800: '#373e4d',
          900: '#151a23',
        },
        brand: {
          50: '#eef7f6',
          100: '#d5ebe9',
          200: '#aed8d5',
          300: '#7dbabb',
          400: '#4f999c',
          500: '#3b7f83',
          600: '#30676c',
          700: '#2a5459',
          800: '#264649',
          900: '#1e3639',
        },
        accent: {
          400: '#d9a441',
          500: '#c88a2d',
          600: '#a96e22',
        },
        surface: '#ffffff',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(21,26,35,0.04), 0 1px 3px rgba(21,26,35,0.06)',
        lift: '0 6px 24px rgba(21,26,35,0.10)',
      },
      borderRadius: {
        xl: '0.9rem',
      },
    },
  },
  plugins: [],
};

export default config;
