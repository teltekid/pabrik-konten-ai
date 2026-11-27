import { Pool } from 'pg'
import { auth } from './auth'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

async function getSession(req: Request) {
  const session = await (auth as any).api.getSession({ headers: req.headers })
  return session?.user ? session.user : null
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

export default async (req: Request): Promise<Response> => {
  try {
    const user = await getSession(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    // path: .../workspaces or .../workspaces/:id or .../workspaces/:id/brand-profile
    const idx = parts.indexOf('workspaces')
    const rest = idx >= 0 ? parts.slice(idx + 1) : []

    if (req.method === 'GET' && rest.length === 0) {
      const { rows } = await pool.query(
        'SELECT * FROM workspaces WHERE owner_id = $1 ORDER BY created_at DESC',
        [user.id],
      )
      return json(rows)
    }

    if (req.method === 'POST' && rest.length === 0) {
      const body = await req.json()
      const name = String(body?.name || '').trim()
      if (!name) return json({ error: 'name required' }, 400)
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
      // cari slug unik per owner (hindari duplicate key)
      let slug = base
      let n = 1
      for (;;) {
        const ex = await pool.query('SELECT 1 FROM workspaces WHERE owner_id = $1 AND slug = $2', [user.id, slug])
        if (ex.rowCount === 0) break
        n += 1
        slug = `${base}-${n}`
      }
      const { rows } = await pool.query(
        'INSERT INTO workspaces (owner_id, name, slug, review_enabled, telegram_bot_token, telegram_chat_id, strategy) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [user.id, name, slug, !!body?.review_enabled, body?.telegram_bot_token ?? null, body?.telegram_chat_id ?? null, body?.strategy ?? null],
      )
      const ws = rows[0]
      await pool.query('INSERT INTO brand_profiles (workspace_id) VALUES ($1)', [ws.id])
      return json(ws, 201)
    }

    const id = rest[0]
    if (!id) return json({ error: 'Not found' }, 404)

    // ownership check
    const own = await pool.query('SELECT id FROM workspaces WHERE id = $1 AND owner_id = $2', [id, user.id])
    if (own.rowCount === 0) return json({ error: 'Not found' }, 404)

    if (rest.length === 1) {
      if (req.method === 'GET') {
        const { rows } = await pool.query('SELECT * FROM workspaces WHERE id = $1', [id])
        return json(rows[0])
      }
      if (req.method === 'PATCH') {
        const body = await req.json()
        const { rows } = await pool.query(
          'UPDATE workspaces SET name = COALESCE($1, name), review_enabled = COALESCE($2, review_enabled), telegram_bot_token = COALESCE($3, telegram_bot_token), telegram_chat_id = COALESCE($4, telegram_chat_id), strategy = COALESCE($5, strategy) WHERE id = $6 RETURNING *',
          [body?.name ?? null, body?.review_enabled ?? null, body?.telegram_bot_token ?? null, body?.telegram_chat_id ?? null, body?.strategy ?? null, id],
        )
        return json(rows[0])
      }
      if (req.method === 'DELETE') {
        await pool.query('DELETE FROM workspaces WHERE id = $1', [id])
        return json({ ok: true })
      }
    }

    if (rest[1] === 'brand-profile') {
      if (req.method === 'GET') {
        const { rows } = await pool.query('SELECT * FROM brand_profiles WHERE workspace_id = $1', [id])
        return json(rows[0] || null)
      }
      if (req.method === 'PUT') {
        const body = await req.json()
        const { rows } = await pool.query(
          `UPDATE brand_profiles SET
            name = $1, voice_tone = $2, writing_style = $3, target_audience = $4,
            key_offers = $5, hashtags = $6, dos = $7, donts = $8, example_posts = $9
           WHERE workspace_id = $10 RETURNING *`,
          [
            body?.name ?? null,
            body?.voice_tone ?? null,
            body?.writing_style ?? null,
            body?.target_audience ?? null,
            JSON.stringify(body?.key_offers ?? []),
            body?.hashtags ?? [],
            body?.dos ?? [],
            body?.donts ?? [],
            JSON.stringify(body?.example_posts ?? []),
            id,
          ],
        )
        return json(rows[0])
      }
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    console.error('[workspaces] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}