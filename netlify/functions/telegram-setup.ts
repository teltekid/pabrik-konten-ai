import { Pool } from 'pg'
import { auth } from './auth'
import { getEnv } from './_env'
import { tgSetWebhook } from './_telegram'

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
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const body = await req.json()
    const ws = body?.workspace_id
    const own = await pool.query('SELECT * FROM workspaces WHERE id=$1 AND owner_id=$2', [ws, user.id])
    if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
    const workspace = own.rows[0]
    if (!workspace.telegram_bot_token) return json({ error: 'telegram_bot_token belum diset' }, 400)

    const secret = getEnv('TELEGRAM_WEBHOOK_SECRET') || undefined
    const base = process.env.PUBLIC_URL || new URL(req.url).origin
    const url = `${base}/.netlify/functions/telegram-webhook`
    await tgSetWebhook(workspace.telegram_bot_token, url, secret)
    return json({ ok: true, url })
  } catch (e: any) {
    console.error('[telegram-setup] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}