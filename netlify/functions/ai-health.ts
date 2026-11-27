import { Pool } from 'pg'
import { auth } from './auth'
import { generateText, generateImage } from './_ai'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})
async function getSession(req: Request) {
  const s = await (auth as any).api.getSession({ headers: req.headers })
  return s?.user ? s.user : null
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

export default async (req: Request): Promise<Response> => {
  try {
    const user = await getSession(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    if (req.method === 'GET') {
      const { rows } = await pool.query('SELECT * FROM ai_health ORDER BY checked_at DESC LIMIT 30')
      const latest: Record<string, any> = {}
      for (const r of rows) {
        const key = `${r.kind}:${r.provider}`
        if (!latest[key]) latest[key] = r
      }
      return json({ rows, latest: Object.values(latest) })
    }

    if (req.method === 'POST') {
      const checks: any[] = []
      // Teks
      let t0 = Date.now()
      try {
        const r = await generateText('Balas JSON {"content":"ok","imagePrompt":"ok"}')
        checks.push({ kind: 'text', provider: r.provider, ok: true, latency_ms: Date.now() - t0 })
      } catch (e: any) {
        checks.push({ kind: 'text', provider: 'unknown', ok: false, latency_ms: Date.now() - t0, message: e?.message || String(e) })
      }
      // Gambar
      t0 = Date.now()
      try {
        const r = await generateImage('a simple red circle on white background', 512, 512)
        checks.push({ kind: 'image', provider: r.mode, ok: true, latency_ms: Date.now() - t0 })
      } catch (e: any) {
        checks.push({ kind: 'image', provider: 'unknown', ok: false, latency_ms: Date.now() - t0, message: e?.message || String(e) })
      }
      for (const c of checks) {
        await pool.query(
          'INSERT INTO ai_health (provider, model, kind, ok, latency_ms, message) VALUES ($1,$2,$3,$4,$5,$6)',
          [c.provider, null, c.kind, c.ok, c.latency_ms, c.message ?? null],
        )
      }
      return json({ ok: true, checks })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    console.error('[ai-health] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}