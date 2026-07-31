import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const maplibreDistDir = fileURLToPath(
  new URL('./node_modules/maplibre-gl/dist/', import.meta.url),
)
// The worker's ES module statically imports this sibling chunk by relative
// path, so both files must be served together from the same directory —
// a plain `?url` import only copies the worker and leaves the import 404ing.
const MAPLIBRE_WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']
const MAPLIBRE_WORKER_DIR = 'maplibre-worker'

function maplibreWorkerAssets(): Plugin {
  return {
    name: 'maplibre-worker-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = MAPLIBRE_WORKER_FILES.find(
          (name) => req.url === `/${MAPLIBRE_WORKER_DIR}/${name}`,
        )
        if (!file) return next()
        res.setHeader('Content-Type', 'application/javascript')
        res.end(readFileSync(path.join(maplibreDistDir, file)))
      })
    },
    generateBundle() {
      for (const file of MAPLIBRE_WORKER_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `${MAPLIBRE_WORKER_DIR}/${file}`,
          source: readFileSync(path.join(maplibreDistDir, file)),
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), maplibreWorkerAssets()],
})
