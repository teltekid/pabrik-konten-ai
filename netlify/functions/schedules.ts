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
    const idx = parts.indexOf('schedules')
    const rest = idx >= 0 ? parts.slice(idx + 1) : []

    if (req.method === 'GET') {
      const account = url.searchParams.get('account_id')
      if (!account) return json({ error: 'account_id required' }, 400)
      const own = await pool.query('SELECT a.id FROM accounts a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=$1 AND w.owner_id=$2', [account, user.id])
      if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
      const { rows } = await pool.query('SELECT * FROM schedules WHERE account_id=$1 ORDER BY day_of_week,time_slot', [account])
      return json(rows)
    }
    if (req.method === 'POST') {
      const body = await req.json()
      const account = body?.account_id
      const own = await pool.query('SELECT a.id FROM accounts a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=$1 AND w.owner_id=$2', [account, user.id])
      if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
      const { rows } = await pool.query('INSERT INTO schedules (account_id,day_of_week,time_slot) VALUES ($1,$2,$3) RETURNING *', [account, body.day_of_week, body.time_slot])
      return json(rows[0], 201)
    }
    const id = rest[0]
    if (!id) return json({ error: 'Not found' }, 404)
    if (req.method === 'DELETE') {
      const own = await pool.query('SELECT s.id FROM schedules s JOIN accounts a ON a.id=s.account_id JOIN workspaces w ON w.id=a.workspace_id WHERE s.id=$1 AND w.owner_id=$2', [id, user.id])
      if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
      await pool.query('DELETE FROM schedules WHERE id=$1', [id])
      return json({ ok: true })
    }
    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    console.error('[schedules] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}