import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.simpletrailer.app',
  appName: 'SimpleTrailer',
  webDir: 'www',

  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: 'simpletrailer.de',
    cleartext: false
  },

  ios: {
    contentInset: 'always',
    backgroundColor: '#0D0D0D',
    preferredContentMode: 'mobile',
    limitsNavigationsToAppBoundDomains: false
  },

  android: {
    allowMixedContent: false,
    backgroundColor: '#0D0D0D',
    minWebViewVersion: 60
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0D0D0D',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: '#E85D00',
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0D0D0D',
      overlaysWebView: false
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
