import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Env helper: utamakan .env.local (dev, sumber kebenaran) lalu fallback ke process.env (production/Netlify).
// Dibuat karena proses peluncur dev bisa membawa env var "kotor" yang menimpa .env.local.
let cache: Record<string, string> | null = null

function loadFile(): Record<string, string> {
  if (cache) return cache
  cache = {}
  const candidates = [
    join(process.cwd(), '.env.local'),
    join(process.cwd(), '..', '.env.local'),
    join(process.cwd(), '..', '..', '.env.local'),
  ]
  for (const p of candidates) {
    try {
      const txt = readFileSync(p, 'utf8')
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
        if (m) cache[m[1]] = m[2]
      }
      break
    } catch {
      /* coba path berikutnya */
    }
  }
  return cache
}

export function getEnv(key: string): string {
  const file = loadFile()
  if (file[key] !== undefined && file[key] !== '') return file[key]
  return process.env[key] ?? ''
}