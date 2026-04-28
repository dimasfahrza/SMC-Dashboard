export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base:    '#0d0f14',
        panel:   '#13161e',
        elev:    '#191d28',
        hover:   '#1e2330',
        green:   '#22c983',
        red:     '#e8455a',
        yellow:  '#e8a020',
        blue:    '#4a8ff0',
        purple:  '#8c5cf0',
        t1:      '#e8eaf0',
        t2:      '#9097ad',
        t3:      '#555e75',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
