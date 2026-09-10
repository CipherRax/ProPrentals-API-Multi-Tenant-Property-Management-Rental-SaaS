import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral base (cool, slightly green-tinted) — Daraja-style page background
        paper: {
          50: '#F7F9F8',
          100: '#EEF2F0',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#212529',
          900: '#1A1A1A',
        },
        // Primary: Safaricom green
        brand: {
          50: '#E6F7EE',
          100: '#D2F0E1',
          200: '#A8E2C6',
          300: '#73CFA4',
          400: '#3CBB80',
          500: '#00A550',
          600: '#009149',
          700: '#00863F',
          800: '#006B35',
          900: '#0B4A26',
        },
        // Brass: money emphasis, used sparingly
        brass: {
          400: '#d4a643',
          500: '#bf8f2e',
          600: '#9c7022',
          700: '#7d5a1c',
        },
        // Semantic states — aligned with the green brand family + Daraja palette
        emerald: {
          50: '#E6F7EE',
          100: '#D2F0E1',
          200: '#A8E2C6',
          600: '#00A550',
          700: '#00863F',
          800: '#006B35',
        },
        amber: {
          50: '#FEF3C7',
          100: '#FDE68A',
          200: '#FCD34D',
          600: '#D97706',
          700: '#B45309',
        },
        red: {
          50: '#FEE4E2',
          100: '#FECDC9',
          200: '#FDA29B',
          600: '#D92D20',
          700: '#B42318',
        },
        sky: {
          50: '#DBEAFE',
          100: '#BFDBFE',
          200: '#93C5FD',
          600: '#2563EB',
          700: '#1D4ED8',
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
          'var(--font-inter)',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
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
        card: '1rem',
        panel: '0.75rem',
        control: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 2px 4px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.08)',
        panel: '0 1px 2px rgba(0,0,0,0.04)',
        modal: '0 10px 30px rgba(0,0,0,0.14)',
        focus: '0 0 0 3px rgba(0,165,80,0.15)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'zoom-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'zoom-in': 'zoom-in 0.18s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
