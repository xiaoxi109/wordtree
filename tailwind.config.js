/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // 中文用系统高质量黑体，拉丁文用更有性格的几何无衬线。
        sans: [
          'Avenir Next',
          'Avenir',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'system-ui',
          'sans-serif',
        ],
        // 英文单词、数字与标题使用书卷气衬线，建立「学习手账」的识别度。
        display: [
          'Iowan Old Style',
          'Palatino Linotype',
          'Book Antiqua',
          'Songti SC',
          'Georgia',
          'serif',
        ],
      },
      colors: {
        // 中性色与白色由 CSS 变量驱动：浅色是温暖纸感，深色在 index.css 里
        // 换成一套冷调、分层清晰的色板，避免全站出现「半透明白叠纯黑」的灰脏感。
        // rgb(var(--x) / <alpha-value>) 让 /10、/[0.04] 等透明度修饰符照常可用。
        white: 'rgb(var(--tone-white) / <alpha-value>)',
        slate: {
          50: 'rgb(var(--tone-50) / <alpha-value>)',
          100: 'rgb(var(--tone-100) / <alpha-value>)',
          200: 'rgb(var(--tone-200) / <alpha-value>)',
          300: 'rgb(var(--tone-300) / <alpha-value>)',
          400: 'rgb(var(--tone-400) / <alpha-value>)',
          500: 'rgb(var(--tone-500) / <alpha-value>)',
          600: 'rgb(var(--tone-600) / <alpha-value>)',
          700: 'rgb(var(--tone-700) / <alpha-value>)',
          800: 'rgb(var(--tone-800) / <alpha-value>)',
          900: 'rgb(var(--tone-900) / <alpha-value>)',
          950: 'rgb(var(--tone-950) / <alpha-value>)',
        },
        // 深森林绿：主操作、进度与品牌。
        brand: {
          50: '#eaf4ef',
          100: '#d3e8de',
          200: '#a9d2c1',
          300: '#78b7a0',
          400: '#4d9980',
          500: '#2f7d66',
          600: '#236553',
          700: '#1c5144',
          800: '#163f36',
          900: '#10302a',
        },
        accent: {
          lime: '#d9f27c',
          coral: '#d96c4a',
          sand: '#e8d9b5',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 1px 1px rgba(25, 23, 19, 0.03), 0 8px 24px -18px rgba(25, 23, 19, 0.22)',
        card: '0 1px 2px rgba(25, 23, 19, 0.04), 0 14px 36px -22px rgba(25, 23, 19, 0.28)',
        float: '0 18px 50px -22px rgba(25, 23, 19, 0.38)',
        ink: '0 18px 44px -20px rgba(16, 48, 42, 0.55)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'page-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'card-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'scale-in': 'scale-in 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
        'page-in': 'page-in 0.36s cubic-bezier(0.22, 1, 0.36, 1)',
        'card-in': 'card-in 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
