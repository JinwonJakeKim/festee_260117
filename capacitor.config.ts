import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.base68e839a7fae23682478cedbe.app',
  appName: 'Festee',
  webDir: 'dist',
  plugins: {
    SystemBars: {
      // Android WindowInsetsCompat 값을 --safe-area-inset-* CSS 변수로 전달합니다.
      insetsHandling: 'css',
    },
  },
};

export default config;
