/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // A deliberate type scale: micro labels, body, and display.
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.04em' }],
        '3xs': ['9.5px', { lineHeight: '13px', letterSpacing: '0.05em' }],
        xs: ['11.5px', { lineHeight: '16px' }],
        sm: ['12.5px', { lineHeight: '18px' }],
        base: ['13.5px', { lineHeight: '20px' }],
        md: ['14.5px', { lineHeight: '21px' }],
        lg: ['16px', { lineHeight: '23px' }],
        xl: ['18px', { lineHeight: '25px' }],
        '2xl': ['21px', { lineHeight: '27px' }],
        '3xl': ['26px', { lineHeight: '31px' }],
        '4xl': ['32px', { lineHeight: '36px' }],
        display: ['30px', { lineHeight: '34px', letterSpacing: '-0.028em' }],
      },
      spacing: {
        // Tailwind skips halves past 3.5; several components referenced 4.5–9.5,
        // which silently produced no CSS (18px icons rendered at 16px, buttons
        // 34px tall instead of 36px). These are now real values.
        '4.5': '1.125rem',
        '5.5': '1.375rem',
        '6.5': '1.625rem',
        '7.5': '1.875rem',
        '8.5': '2.125rem',
        '9.5': '2.375rem',
        18: '4.5rem',
        22: '5.5rem',
      },
      colors: {
        // Graphite shell — the navigation reads as a distinct surface, not a
        // blue slab. Neutral-first, so data colours carry all the meaning.
        navy: {
          50: '#f5f6f8',
          100: '#e7e9ee',
          200: '#c9ced8',
          300: '#9aa3b2',
          400: '#7b8592', // was #6d7787 — 4.85:1 on the sidebar rail
          500: '#4d5666',
          600: '#3a4251',
          700: '#282f3b',
          800: '#1a2029',
          900: '#11161d',
          950: '#0a0d12',
        },
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#047857', // was #059669 — 3.77:1 on white, used for text
          700: '#036c50',
          800: '#065f46',
          900: '#064e3b',
        },
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        ink: {
          50: '#f7f8fa',
          100: '#f0f2f5',
          200: '#e4e7ec',
          300: '#848d9e', // was #d0d5dd (1.47:1) — 3.34:1, readable separator/empty glyphs
          400: '#69727f', // was #98a2b3 (2.4:1 on canvas) — now 4.54:1, WCAG AA
          500: '#616b7d', // was #667085 — 4.79:1 on ink-100, clears AA on tinted rows
          600: '#4b5565',
          700: '#344054',
          800: '#1d2939',
          900: '#101828',
          950: '#0a0f1a',
        },
        canvas: '#f6f7f9',
      },
      borderRadius: {
        md: '0.4375rem',
        lg: '0.625rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        // Hairline-first elevation: a crisp 1px boundary, then a whisper of
        // ambient shadow. No heavy drop shadows anywhere in the product.
        xs: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px -1px rgb(16 24 40 / 0.05)',
        raised: '0 2px 4px -2px rgb(16 24 40 / 0.06), 0 4px 12px -4px rgb(16 24 40 / 0.08)',
        pop: '0 12px 32px -12px rgb(16 24 40 / 0.18), 0 4px 12px -6px rgb(16 24 40 / 0.10), 0 0 0 1px rgb(16 24 40 / 0.05)',
        drawer: '-32px 0 80px -32px rgb(16 24 40 / 0.28)',
        inset: 'inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
        glow: '0 0 0 1px rgb(5 150 105 / 0.16), 0 6px 20px -8px rgb(5 150 105 / 0.35)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
        snap: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.995)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(28px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'page-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.45)' },
          '70%': { boxShadow: '0 0 0 8px rgba(16,185,129,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'toast-bar': { from: { transform: 'scaleX(1)' }, to: { transform: 'scaleX(0)' } },
        'grow-x': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.16s ease-out',
        'slide-up': 'slide-up 0.2s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right': 'slide-in-right 0.28s cubic-bezier(0.16,1,0.3,1)',
        'page-in': 'page-in 0.24s cubic-bezier(0.16,1,0.3,1)',
        'pulse-ring': 'pulse-ring 2.4s infinite',
        'toast-bar': 'toast-bar 4.6s linear forwards',
        'grow-x': 'grow-x 0.5s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
};
