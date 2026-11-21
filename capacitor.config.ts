import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartstock.ai',
  appName: 'Smart Stock AI',
  webDir: 'dist',
  server: {
    url: 'http://localhost:8080',
    cleartext: true
  }
};

export default config;
