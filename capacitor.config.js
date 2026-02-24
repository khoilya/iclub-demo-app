/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.iclub.demoapp',
  appName: 'ICLUB Demo',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

module.exports = config;
