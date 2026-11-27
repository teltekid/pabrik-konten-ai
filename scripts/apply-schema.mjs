import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const soft = process.argv.includes('--soft')

// Muat .env.local (dev) sebagai sumber kebenaran, lalu fallback ke process.env (Netlify/CI).
const fileEnv = {}
try {
  const txt = readFileSync(join(root, '.env.local'), 'utf8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
    if (m && fileEnv[m[1]] === undefined) fileEnv[m[1]] = m[2]
  }
} catch {}
const env = (k) => (fileEnv[k] !== undefined && fileEnv[k] !== '' ? fileEnv[k] : process.env[k] || '')

const schema = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8')
const betterAuth = readFileSync(join(root, 'supabase', 'better-auth.sql'), 'utf8')

function fail(msg) {
  console.error(msg)
  if (soft) {
    console.warn('[migrate] --soft: melanjutkan tanpa migrasi.')
    process.exit(0)
  }
  process.exit(1)
}

async function migratePg(connectionString) {
  const ssl = env('DATABASE_SSL') === 'false' ? false : { rejectUnauthorized: false }
  const pool = new pg.Pool({ connectionString, ssl })
  try {
    const u = await pool.query('SELECT to_regclass(\'public."user"\') AS t')
    if (!u.rows[0].t) {
      console.log('Menerapkan better-auth.sql...')
      await pool.query(betterAuth)
    }
    console.log('Menerapkan schema.sql...')
    await pool.query(schema)
    const t = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
    )
    console.log('Tabel:', t.rows.map((r) => r.table_name).join(', '))
    console.log('Migrasi selesai (Postgres).')
  } finally {
    await pool.end()
  }
}

async function migrateManagementApi(token, ref) {
  const url = `https://api.supabase.com/v1/projects/${ref}/database/query`
  const run = async (query, label) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60000),
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      throw new Error(`${label} gagal: HTTP ${r.status} ${body.slice(0, 200)}`)
    }
    console.log(`${label} OK`)
  }
  console.log('Menerapkan via Supabase Management API...')
  await run(betterAuth, 'better-auth.sql')
  await run(schema, 'schema.sql')
  console.log('Migrasi selesai (Management API).')
}

try {
  const connectionString = env('DATABASE_URL')
  const token = env('SUPABASE_ACCESS_TOKEN')
  const ref = env('SUPABASE_PROJECT_REF') || env('SUPABASE_PROJECT_ID')
  if (connectionString) {
    await migratePg(connectionString)
  } else if (token && ref) {
    await migrateManagementApi(token, ref)
  } else {
    fail('Tidak ada konfigurasi DB. Set DATABASE_URL, atau SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF.')
  }
} catch (e) {
  fail(`Migrasi gagal: ${e?.message || e}`)
}