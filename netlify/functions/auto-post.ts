import { Pool } from 'pg'
import { auth } from './auth'
import { getEnv } from './_env'
import { publishPost } from './_publish'

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
    const secret = getEnv('CRON_SECRET')
    const url = new URL(req.url)
    const provided = url.searchParams.get('secret') || req.headers.get('x-cron-secret') || ''
    const authed = !!user || (!!secret && provided === secret) || getEnv('ALLOW_UNAUTH_CRON') === 'true'
    if (!authed) return json({ error: 'Unauthorized' }, 401)

    // Post yang sudah di-confirm dan waktunya tiba (zona server = UTC; bandingkan langsung)
    const due = await pool.query(
      "SELECT * FROM posts WHERE review_status='confirmed' AND status <> 'published' AND scheduled_at IS NOT NULL AND scheduled_at <= now() ORDER BY scheduled_at ASC LIMIT 20",
    )
    const results: any[] = []
    for (const p of due.rows) {
      try {
        const r = await publishPost(p.id)
        results.push({ id: p.id, ok: r.allOk, results: r.results })
      } catch (e: any) {
        results.push({ id: p.id, ok: false, error: e?.message || String(e) })
      }
    }
    return json({ checked: due.rows.length, published: results.filter((r) => r.ok).length, results })
  } catch (e: any) {
    console.error('[auto-post] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}