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
    const postId = body?.post_id
    const own = await pool.query('SELECT p.* FROM posts p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=$1 AND w.owner_id=$2', [postId, user.id])
    if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
    const post = own.rows[0]
    const accounts = await pool.query('SELECT * FROM accounts WHERE id = ANY($1::uuid[])', [post.account_ids])
    const results: any[] = []
    for (const acc of accounts.rows) {
      const hasKeys = !!process.env[`${acc.platform.toUpperCase()}_ACCESS_TOKEN`]
      if (!hasKeys) {
        results.push({ account: acc.id, platform: acc.platform, mode: 'mock', ok: true })
        continue
      }
      results.push({ account: acc.id, platform: acc.platform, mode: 'real', ok: false, error: 'not implemented' })
    }
    const allOk = results.every(r => r.ok)
    if (allOk) {
      await pool.query("UPDATE posts SET status='published', published_at=now() WHERE id=$1", [postId])
    } else {
      await pool.query("UPDATE posts SET status='failed', error_message=$1, retry_count=retry_count+1 WHERE id=$2", [JSON.stringify(results), postId])
    }
    return json({ results })
  } catch (e: any) {
    console.error('[publish-real] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}