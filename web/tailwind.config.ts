import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paper/stone neutral base for dense data screens (warm, not pure gray)
        paper: {
          50: '#fafaf8',
          100: '#f4f4f0',
          200: '#e8e7e0',
          300: '#d6d4c9',
          400: '#b5b2a4',
          500: '#969282',
          600: '#7a7668',
          700: '#5f5c51',
          800: '#46443c',
          900: '#2c2b26',
        },
        // Primary: deep architectural teal (restrained, trustworthy)
        brand: {
          50: '#eef6f5',
          100: '#d5e8e7',
          200: '#aed4d1',
          300: '#7fb9b7',
          400: '#559a99',
          500: '#3d7e7e',
          600: '#2f6666',
          700: '#275355',
          800: '#234547',
          900: '#1c3638',
        },
        // Brass: money emphasis, used sparingly
        brass: {
          400: '#d4a643',
          500: '#bf8f2e',
          600: '#9c7022',
          700: '#7d5a1c',
        },
        // Semantic states for rent/payment — restrained, readable
        emerald: {
          50: '#edf7f0',
          100: '#d3ebda',
          200: '#a9d8b9',
          600: '#2c7a45',
          700: '#236b3c',
        },
        amber: {
          50: '#fdf6ec',
          100: '#f9e8cf',
          200: '#f1d09b',
          600: '#b8791f',
          700: '#97611a',
        },
        red: {
          50: '#fbf0ef',
          100: '#f4dcdb',
          200: '#e7b4b1',
          600: '#b13b33',
          700: '#93312b',
        },
        sky: {
          50: '#eff7fb',
          100: '#d9ecf4',
          200: '#b4d9e8',
          600: '#2a6d8a',
          700: '#245c75',
        },
        violet: {
          50: '#f4f1fb',
          100: '#e5def5',
          600: '#6d54a8',
          700: '#5a458c',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Inter',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        tightest: '-0.02em',
      },
      borderRadius: {
        card: '0.625rem',
        panel: '0.5rem',
        control: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(44,43,38,0.04), 0 1px 3px rgba(44,43,38,0.05)',
        'card-hover': '0 2px 4px rgba(44,43,38,0.06), 0 6px 16px rgba(44,43,38,0.08)',
        panel: '0 1px 2px rgba(44,43,38,0.03)',
        focus: '0 0 0 3px rgba(47,102,102,0.20)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
