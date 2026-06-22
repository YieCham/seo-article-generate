import { cpSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

function copyBundledSkills(): { name: string; closeBundle: () => void } {
  return {
    name: 'copy-bundled-skills',
    closeBundle() {
      const src = resolve(__dirname, 'src/main/bundled-skills')
      const dest = resolve(__dirname, 'out/main/bundled-skills')
      if (!existsSync(src)) return
      mkdirSync(dest, { recursive: true })
      cpSync(src, dest, { recursive: true })
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyBundledSkills()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    publicDir: resolve(__dirname, 'icons'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
