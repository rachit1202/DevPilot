import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        devpilot: {
          bg: '#09090F',
          sidebar: '#10111A',
          card: '#151621',
          cardHover: '#1B1C2A',
          border: '#272938',
          borderHover: '#373A4F',
          purple: '#8B5CF6',
          purpleHover: '#7C3AED',
          cyan: '#06B6D4',
          cyanHover: '#0891B2',
          text: '#F8FAFC',
          muted: '#94A3B8',
          subtle: '#64748B',
          success: '#22C55E',
          warning: '#F59E0B',
          danger: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
