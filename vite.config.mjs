import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import autoprefixer from 'autoprefixer'
import checker from 'vite-plugin-checker'
import bundleAnalyzer from 'rollup-plugin-bundle-analyzer'
import { execSync } from 'node:child_process'

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
      checker({
        vueTsc: true,
        eslint: {
          lintCommand: 'eslint . --ext .vue,.ts,.js --ignore-path .gitignore',
        },
        overlay: { initialIsOpen: 'error' }
      }),
      bundleAnalyzer({
        analyzerMode: 'static',
        reportFilename: 'report.html'
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['mixed-decls', 'color-functions', 'global-builtin', 'import']
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
