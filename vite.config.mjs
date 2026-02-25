import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import autoprefixer from 'autoprefixer'
import checker from 'vite-plugin-checker'
import bundleAnalyzer from 'rollup-plugin-bundle-analyzer'
import { execSync } from 'node:child_process'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(() => {
  const buildDate = new Date().toISOString()
  let buildVersion = 'dev'
  const basePath = process.env.BASE_PATH || '/'

  try {
    buildVersion = execSync('git describe --tags --always', { encoding: 'utf8' }).trim()
  } catch {
    buildVersion = 'unknown'
  }

  return {
    base: basePath,
    build: {
      outDir: `dist${basePath}`
    },
    plugins: [
      vue(),

      // ----------------------------------------------------
      // PWA plugin with injectManifest strategy
      // ----------------------------------------------------
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}']
        },
        manifest: {
          name: 'Airdrome',
          short_name: 'Airdrome',
          start_url: '/',
          display: 'standalone',
          theme_color: '#000000',
          background_color: '#000000',
          icons: [
            {
              "src": "/icon-512x512.png",
              "sizes": "512x512",
              "type": "image/png",
              "purpose": "any"
            },
            {
              "src": "/icon-512x512-maskable.png",
              "sizes": "512x512",
              "type": "image/png",
              "purpose": "maskable"
            }
          ],
          screenshots: [
            {
              "src": "/screen-wide.png",
              "sizes": "1024x560",
              "type": "image/png",
              "form_factor": "wide"
            },
            {
              "src": "/screen-mobile.png",
              "sizes": "640x1424",
              "type": "image/png"
            }
          ]
        }
      }),

      // ----------------------------------------------------
      // TypeScript / ESLint / Vue checker
      // ----------------------------------------------------
      checker({
        vueTsc: true,
        eslint: {
          lintCommand: 'eslint .'   // you can add --ext if needed
        },
        overlay: { initialIsOpen: 'error' }
      }),

      // ----------------------------------------------------
      // Bundle analyzer
      // ----------------------------------------------------
      bundleAnalyzer({
        analyzerMode: 'static',
        reportFilename: 'report.html'
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        'bootstrap-vue-3': 'bootstrap-vue-next'
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['if-function', 'mixed-decls', 'color-functions', 'global-builtin', 'import']
        }
      },
      postcss: { plugins: [autoprefixer()] }
    },
    define: {
      __BUILD_DATE__: JSON.stringify(buildDate),
      __BUILD_VERSION__: JSON.stringify(buildVersion)
    }
  }
})
