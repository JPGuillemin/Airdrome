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
  const basePath = process.env.BASE_PATH || '/airdrome/'

  try {
    buildVersion = execSync('git describe --tags --always', { encoding: 'utf8' }).trim()
  } catch {
    buildVersion = 'unknown'
  }

  // custom plugin to rewrite /public/ files
  const rewritePublicFilesPlugin = () => ({
    name: 'rewrite-public-files',
    apply: 'build',
    generateBundle(_, bundle) {
      const filesToRewrite = ['manifest.webmanifest', 'index.html', 'sw.js', 'service-worker.js']

      for (const fileName of filesToRewrite) {
        const file = bundle[fileName]
        if (file && file.source) {
          let text = file.source.toString()

          // Replace leading slashes in href/src/srcset with the base path
          text = text
            .replace(/(["'])\/(?!\/)/g, `$1${basePath}`) // href="/..." or src="/..." → href="/airdrome/..."
            .replace(/(["']):\/\//g, '$1://') // don’t break http://
          text = text.replace(
            /const\s+APP_BASE\s*=\s*['"].*?['"]/,
            `const APP_BASE = '${basePath}'`
          )
          file.source = text
          bundle[fileName] = file
        }
      }
    },
  })

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
      rewritePublicFilesPlugin() // <-- add our plugin
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
