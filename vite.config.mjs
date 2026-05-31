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
  const basePath = process.env.BASE_PATH ?? '/'
  const appVersion = process.env.VERSION

  try {
    buildVersion = execSync('git describe --tags --always', { encoding: 'utf8' }).trim()
  } catch {
    buildVersion = 'unknown'
  }

  return {
    base: basePath,
    build: {
      outDir: 'dist'
    },
    plugins: [
      vue(),
      // ----------------------------------------------------
      // TypeScript / ESLint / Vue checker
      // ----------------------------------------------------
      checker({
        vueTsc: true,
        eslint: {
          lintCommand: 'eslint .'
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

      // ----------------------------------------------------
      // PWA — injects hashed asset manifest into SW at build
      // ----------------------------------------------------
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'public',
        filename: 'service-worker.js',
        outDir: 'dist',
        define: {
          __APP_VERSION__: JSON.stringify(appVersion),
          __BUILD_DATE__: JSON.stringify(buildDate),
          __BUILD_VERSION__: JSON.stringify(buildVersion),
        },
        injectManifest: {
          // Only precache JS, CSS and essential static assets.
          // Audio and cover-art are handled at runtime by the SW itself.
          globPatterns: ['**/*.{js,css,html,webmanifest,png,svg,ico}'],
          globIgnores: ['report.html'],
          // SW uses plain globals (self, caches, fetch) — not an ES module.
          // Tell Rollup to treat it as an IIFE so it doesn't try to resolve
          // imports and doesn't wrap the output in module scaffolding.
          rollupFormat: 'iife',
        },
        // Disable the auto-generated manifest / register helpers —
        // the app registers the SW itself.
        manifest: false,
        injectRegister: null,
        devOptions: {
          enabled: false,
        },
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
          silenceDeprecations: ['color-functions', 'global-builtin', 'import']
        }
      },
      postcss: { plugins: [autoprefixer()] }
    },
    define: {
      __BUILD_DATE__: JSON.stringify(buildDate),
      __BUILD_VERSION__: JSON.stringify(buildVersion),
      __APP_VERSION__: JSON.stringify(appVersion)
    }
  }
})
