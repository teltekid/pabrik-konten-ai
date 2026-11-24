// E2E connectivity check. Jalankan: node scripts/e2e_check.mjs
// Butuh .env di root (lihat .env.example). Tidak menampilkan nilai rahasia.
import { readFileSync } from 'node:fs'

function loadEnv() {
  const env = {}
  for (const file of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (m) env[m[1]] = m[2]
      }
    } catch { /* file tidak ada */ }
  }
  return env
}

const env = { ...loadEnv(), ...process.env }
const results = []
const ok = (n, d = '') => results.push({ n, ok: true, d })
const bad = (n, d = '') => results.push({ n, ok: false, d })

async function check(name, fn) {
  try { const d = await fn(); ok(name, d) }
  catch (e) { bad(name, e.message) }
}

// 1. Supabase anon read
await check('Supabase (anon read video_jobs)', async () => {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / ANON_KEY kosong')
  const r = await fetch(`${url}/rest/v1/video_jobs?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
  return 'OK'
})

// 2. GitHub PAT
await check('GitHub PAT (GET /user)', async () => {
  const pat = env.GITHUB_PAT
  if (!pat) throw new Error('GITHUB_PAT kosong')
  const r = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${pat}`, 'User-Agent': 'e2e-check' },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json()
  return `login=${j.login}`
})

// 3. OpenRouter
await check('OpenRouter (GET /models)', async () => {
  const key = env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY kosong')
  const r = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return 'OK'
})

// 4. Telegram
await check('Telegram (getMe)', async () => {
  const t = env.TELEGRAM_BOT_TOKEN
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN kosong')
  const r = await fetch(`https://api.telegram.org/bot${t}/getMe`)
  const j = await r.json()
  if (!j.ok) throw new Error(j.description || 'getMe gagal')
  return `bot=@${j.result.username}`
})

// 5. Google Drive creds parse
await check('Google Drive (parse JSON)', async () => {
  const raw = env.GDRIVE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GDRIVE_SERVICE_ACCOUNT_JSON kosong')
  const j = JSON.parse(raw)
  if (!j.client_email) throw new Error('client_email tidak ada')
  return `sa=${j.client_email}`
})

// 6. Netlify function (opsional)
await check('Netlify Function /trigger (opsional)', async () => {
  const base = env.NETLIFY_URL
  if (!base) return 'SKIP (NETLIFY_URL kosong)'
  const r = await fetch(`${base}/.netlify/functions/trigger`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return `HTTP ${r.status} (400 = endpoint hidup)`
})

console.log('\n=== E2E CONNECTIVITY ===')
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.n}${r.d ? ' — ' + r.d : ''}`)
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} OK, ${failed} gagal`)
process.exit(failed ? 1 : 0)