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
    const idx = parts.indexOf('accounts')
    const rest = idx >= 0 ? parts.slice(idx + 1) : []

    if (req.method === 'GET' && rest.length === 0) {
      const ws = url.searchParams.get('workspace_id')
      if (!ws) return json({ error: 'workspace_id required' }, 400)
      const own = await pool.query('SELECT id FROM workspaces WHERE id=$1 AND owner_id=$2', [ws, user.id])
      if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
      const { rows } = await pool.query('SELECT id,workspace_id,platform,label,handle,status,created_at,updated_at FROM accounts WHERE workspace_id=$1 ORDER BY created_at DESC', [ws])
      return json(rows)
    }

    if (req.method === 'POST' && rest.length === 0) {
      const body = await req.json()
      const ws = body?.workspace_id
      const own = await pool.query('SELECT id FROM workspaces WHERE id=$1 AND owner_id=$2', [ws, user.id])
      if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
      const platform = body?.platform
      const label = String(body?.label || '').trim()
      if (!label) return json({ error: 'label required' }, 400)
      // mock connect
      const handle = body?.handle || `@${label.toLowerCase().replace(/\s+/g, '_')}`
      const { rows } = await pool.query(
        'INSERT INTO accounts (workspace_id,platform,label,handle,status,token_enc) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,workspace_id,platform,label,handle,status,created_at,updated_at',
        [ws, platform, label, handle, 'connected', 'mock-encrypted-token'],
      )
      return json(rows[0], 201)
    }

    const id = rest[0]
    if (!id) return json({ error: 'Not found' }, 404)
    const own = await pool.query('SELECT a.id FROM accounts a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=$1 AND w.owner_id=$2', [id, user.id])
    if (own.rowCount === 0) return json({ error: 'Not found' }, 404)

    if (req.method === 'PATCH') {
      const body = await req.json()
      const { rows } = await pool.query(
        'UPDATE accounts SET label=COALESCE($1,label), handle=COALESCE($2,handle), status=COALESCE($3,status) WHERE id=$4 RETURNING id,workspace_id,platform,label,handle,status,created_at,updated_at',
        [body?.label ?? null, body?.handle ?? null, body?.status ?? null, id],
      )
      return json(rows[0])
    }
    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM accounts WHERE id=$1', [id])
      return json({ ok: true })
    }
    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    console.error('[accounts] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}