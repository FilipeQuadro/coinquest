import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'

const host = '127.0.0.1'
const port = 5173
const url = `http://${host}:${port}/`
const env = {
  ...process.env,
  PLAYWRIGHT: '1',
  PLAYWRIGHT_MANAGED_SERVER: '1',
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    function attempt() {
      const request = http.get(url, (response) => {
        response.resume()
        resolve()
      })

      request.on('error', () => {
        if (Date.now() - startedAt > 30_000) {
          reject(new Error(`Timed out waiting for ${url}`))
          return
        }
        setTimeout(attempt, 250)
      })

      request.setTimeout(1000, () => {
        request.destroy()
      })
    }

    attempt()
  })
}

function stopProcess(child) {
  if (!child.pid || child.killed) return

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    return
  }

  child.kill('SIGTERM')
}

const vite = spawn(
  process.execPath,
  ['./node_modules/vite/bin/vite.js', '--host', host, '--strictPort'],
  {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

vite.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`))
vite.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))

try {
  await waitForServer()

  const result = await new Promise((resolve) => {
    const playwright = spawn(process.execPath, ['./node_modules/playwright/cli.js', 'test'], {
      env,
      stdio: 'inherit',
    })

    playwright.on('exit', (code) => resolve(code ?? 1))
  })

  stopProcess(vite)
  process.exit(result)
} catch (error) {
  stopProcess(vite)
  console.error(error)
  process.exit(1)
}
