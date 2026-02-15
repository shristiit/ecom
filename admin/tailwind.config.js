/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './constants/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',

        border: 'rgb(var(--border) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',

        text: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        subtle: 'rgb(var(--text-subtle) / <alpha-value>)',

        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          hover: 'rgb(var(--primary-hover) / <alpha-value>)',
          active: 'rgb(var(--primary-active) / <alpha-value>)',
          tint: 'rgb(var(--primary-tint) / <alpha-value>)',
          'tint-strong': 'rgb(var(--primary-tint-strong) / <alpha-value>)',
        },
        'on-primary': 'rgb(var(--on-primary) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',

        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          tint: 'rgb(var(--success-tint) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          tint: 'rgb(var(--warning-tint) / <alpha-value>)',
        },
        error: {
          DEFAULT: 'rgb(var(--error) / <alpha-value>)',
          tint: 'rgb(var(--error-tint) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          tint: 'rgb(var(--info-tint) / <alpha-value>)',
        },

        chart: {
          1: 'rgb(var(--chart-1) / <alpha-value>)',
          2: 'rgb(var(--chart-2) / <alpha-value>)',
          3: 'rgb(var(--chart-3) / <alpha-value>)',
          4: 'rgb(var(--chart-4) / <alpha-value>)',
          5: 'rgb(var(--chart-5) / <alpha-value>)',
          6: 'rgb(var(--chart-6) / <alpha-value>)',
          7: 'rgb(var(--chart-7) / <alpha-value>)',
          8: 'rgb(var(--chart-8) / <alpha-value>)',
          9: 'rgb(var(--chart-9) / <alpha-value>)',
          10: 'rgb(var(--chart-10) / <alpha-value>)',
        },

        // Backward-compatible aliases used in current screens
        bgPrimary: 'rgb(var(--bg) / <alpha-value>)',
        bgSecondary: 'rgb(var(--surface-2) / <alpha-value>)',
        bgElevated: 'rgb(var(--surface) / <alpha-value>)',
        textPrimary: 'rgb(var(--text) / <alpha-value>)',
        textSecondary: 'rgb(var(--text-muted) / <alpha-value>)',
        textMuted: 'rgb(var(--text-subtle) / <alpha-value>)',
        borderSubtle: 'rgb(var(--border) / <alpha-value>)',
        borderStrong: 'rgb(var(--border-strong) / <alpha-value>)',
        accent: 'rgb(var(--primary) / <alpha-value>)',
        accentSoft: 'rgb(var(--primary-tint) / <alpha-value>)',
      },

      spacing: {
        0: 'var(--space-0)',
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        7: 'var(--space-7)',
        8: 'var(--space-8)',
        9: 'var(--space-9)',
        10: 'var(--space-10)',
        11: 'var(--space-11)',
        12: 'var(--space-12)',
        13: 'var(--space-13)',
      },

      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },

      boxShadow: {
        soft: 'var(--shadow-soft)',
        lift: 'var(--shadow-lift)',
      },

      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
      },

      fontSize: {
        'display-1': ['var(--fs-display-1)', { lineHeight: 'var(--lh-display-1)', letterSpacing: 'var(--ls-tight)' }],
        'display-2': ['var(--fs-display-2)', { lineHeight: 'var(--lh-display-2)', letterSpacing: 'var(--ls-tight)' }],
        'display-3': ['var(--fs-display-3)', { lineHeight: 'var(--lh-display-3)', letterSpacing: 'var(--ls-tight)' }],
        title: ['var(--fs-title)', { lineHeight: 'var(--lh-title)', letterSpacing: 'var(--ls-tight-2)' }],
        section: ['var(--fs-section)', { lineHeight: 'var(--lh-section)' }],
        body: ['var(--fs-body)', { lineHeight: 'var(--lh-body)' }],
        small: ['var(--fs-small)', { lineHeight: 'var(--lh-small)' }],
        caption: ['var(--fs-caption)', { lineHeight: 'var(--lh-caption)' }],
      },

      letterSpacing: {
        tightish: 'var(--ls-tight)',
        tightish2: 'var(--ls-tight-2)',
      },

      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },

      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
        linear: 'var(--ease-linear)',
      },

      zIndex: {
        sticky: 'var(--z-sticky)',
        dropdown: 'var(--z-dropdown)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
        tooltip: 'var(--z-tooltip)',
      },
    },
  },
  plugins: [],
};
