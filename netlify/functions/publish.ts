import { Pool } from 'pg'
import { auth } from './auth'
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } })
async function getSession(req: Request) { const s = await (auth as any).api.getSession({ headers: req.headers }); return s?.user ? s.user : null }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }) }

export default async (req: Request): Promise<Response> => {
  try {
    const user = await getSession(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const body = await req.json()
    const id = body?.post_id
    const mode = body?.mode || 'now'
    const own = await pool.query('SELECT p.id FROM posts p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=$1 AND w.owner_id=$2', [id, user.id])
    if (own.rowCount === 0) return json({ error: 'Not found' }, 404)

    if (mode === 'now') {
      const { rows } = await pool.query("UPDATE posts SET status='published', published_at=now() WHERE id=$1 RETURNING *", [id])
      return json(rows[0])
    }
    if (mode === 'schedule') {
      const { rows } = await pool.query("UPDATE posts SET status='scheduled', scheduled_at=$1 WHERE id=$2 RETURNING *", [body?.scheduled_at, id])
      return json(rows[0])
    }
    if (mode === 'prioritize') {
      const { rows } = await pool.query("UPDATE posts SET status='scheduled', scheduled_at=now() WHERE id=$1 RETURNING *", [id])
      return json(rows[0])
    }
    return json({ error: 'unknown mode' }, 400)
  } catch (e: any) {
    console.error('[publish] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}