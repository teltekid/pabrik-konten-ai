import { Pool } from 'pg'
import { auth } from './auth'
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } })
async function getSession(req: Request) { const s = await (auth as any).api.getSession({ headers: req.headers }); return s?.user ? s.user : null }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }) }

export default async (req: Request): Promise<Response> => {
  try {
    const user = await getSession(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    const idx = parts.indexOf('posts')
    const rest = idx >= 0 ? parts.slice(idx + 1) : []

    if (req.method === 'GET' && rest.length === 0) {
      const ws = url.searchParams.get('workspace_id')
      if (!ws) return json({ error: 'workspace_id required' }, 400)
      const own = await pool.query('SELECT id FROM workspaces WHERE id=$1 AND owner_id=$2', [ws, user.id])
      if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
      const { rows } = await pool.query('SELECT * FROM posts WHERE workspace_id=$1 ORDER BY created_at DESC', [ws])
      return json(rows)
    }
    if (req.method === 'POST' && rest.length === 0) {
      const body = await req.json()
      const ws = body?.workspace_id
      const own = await pool.query('SELECT id FROM workspaces WHERE id=$1 AND owner_id=$2', [ws, user.id])
      if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
      const { rows } = await pool.query(
        `INSERT INTO posts (workspace_id,account_ids,caption,media_urls,hashtags,first_comment,location,tags,status,scheduled_at,post_type,topic,media_prompt,review_status,slide_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [ws, body?.account_ids ?? [], body?.caption ?? null, body?.media_urls ?? [], body?.hashtags ?? [], body?.first_comment ?? null, body?.location ?? null, body?.tags ?? [], body?.status ?? 'draft', body?.scheduled_at ?? null, body?.post_type ?? 'image', body?.topic ?? null, body?.media_prompt ?? null, body?.review_status ?? 'draft', Number.isInteger(body?.slide_count) && body.slide_count > 0 ? body.slide_count : null],
      )
      return json(rows[0], 201)
    }
    const id = rest[0]
    if (!id) return json({ error: 'Not found' }, 404)
    const own = await pool.query('SELECT p.id FROM posts p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=$1 AND w.owner_id=$2', [id, user.id])
    if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
    if (req.method === 'PATCH') {
      const body = await req.json()
      const { rows } = await pool.query(
        `UPDATE posts SET caption=COALESCE($1,caption), status=COALESCE($2,status), scheduled_at=COALESCE($3,scheduled_at), account_ids=COALESCE($4,account_ids), media_urls=COALESCE($5,media_urls), hashtags=COALESCE($6,hashtags), first_comment=COALESCE($7,first_comment), location=COALESCE($8,location), tags=COALESCE($9,tags), post_type=COALESCE($10,post_type), topic=COALESCE($11,topic), media_prompt=COALESCE($12,media_prompt), review_status=COALESCE($13,review_status), slide_count=COALESCE($14,slide_count) WHERE id=$15 RETURNING *`,
        [body?.caption ?? null, body?.status ?? null, body?.scheduled_at ?? null, body?.account_ids ?? null, body?.media_urls ?? null, body?.hashtags ?? null, body?.first_comment ?? null, body?.location ?? null, body?.tags ?? null, body?.post_type ?? null, body?.topic ?? null, body?.media_prompt ?? null, body?.review_status ?? null, Number.isInteger(body?.slide_count) && body.slide_count > 0 ? body.slide_count : null, id],
      )
      return json(rows[0])
    }
    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM posts WHERE id=$1', [id])
      return json({ ok: true })
    }
    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    console.error('[posts] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}