import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import autoprefixer from 'autoprefixer'
import checker from 'vite-plugin-checker'
import bundleAnalyzer from 'rollup-plugin-bundle-analyzer'
import { execSync } from 'node:child_process'

export default defineConfig(() => {
  // 🔧 On génère des infos au moment du build
  const buildDate = new Date().toISOString()
  let buildVersion = 'dev'

  try {
    // si git est dispo, récupère le dernier tag ou commit court
    buildVersion = execSync('git describe --tags --always', { encoding: 'utf8' }).trim()
  } catch {
    buildVersion = 'unknown'
  }

  return {
    plugins: [
      vue(),
      checker({
        vueTsc: true,
        eslint: {
          lintCommand: 'eslint . --ext .vue,.ts,.js --ignore-path .gitignore',
        },
        overlay: {
          initialIsOpen: 'error',
        }
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
      postcss: {
        plugins: [autoprefixer()]
      }
    },

    // 🧩 Variables globales accessibles dans tout le code
    define: {
      __BUILD_DATE__: JSON.stringify(buildDate),
      __BUILD_VERSION__: JSON.stringify(buildVersion)
    }
  }
})
