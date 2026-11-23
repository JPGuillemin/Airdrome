// capacitor.config.ts
//
// Capacitor configuration for the native Android build.
//
// The PWA build is unaffected: Vite still emits a normal `dist/` folder and
// the service worker remains enabled in browsers. Capacitor only wraps that
// same `dist/` output in a native WebView.
//
// `androidScheme: 'http'` keeps the WebView origin on http://localhost so
// users can point Airdrome at a plain-HTTP Subsonic server on their LAN
// without hitting mixed-content rules. ExoPlayer fetches streams natively
// anyway, but the Subsonic JSON API still goes through the WebView.

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.jpguillemin.airdrome',
  appName: 'Airdrome',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
    allowNavigation: ['*']
  },
  android: {
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#09090b',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#09090b'
    }
  }
}

export default config
