import { Pool } from 'pg'
import { auth } from './auth'
import { tgSend, escapeHtml } from './_telegram'

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

function typeLabel(t: string): string {
  if (t === 'carousel') return 'Carousel'
  if (t === 'video_reel') return 'Video Reel'
  return 'Gambar'
}

function reviewText(p: any): string {
  const when = p.scheduled_at ? new Date(p.scheduled_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-'
  const caption = escapeHtml(String(p.caption || '(tanpa caption)').slice(0, 800))
  return (
    `🔍 <b>Review Konten</b> #${String(p.id).slice(0, 8)}\n` +
    `📅 ${escapeHtml(when)} WIB\n` +
    `📌 Tipe: <b>${typeLabel(p.post_type)}</b>\n` +
    `🎯 Topik: ${escapeHtml(p.topic || '-')}\n\n` +
    `📝 <b>Caption:</b>\n${caption}\n\n` +
    `🖼 Media: ${(p.media_urls || []).length} item\n\n` +
    `Balas <b>confirm</b> untuk posting ke Instagram, atau <b>perbaiki</b> untuk generate ulang.`
  )
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
    if (!workspace.telegram_bot_token || !workspace.telegram_chat_id) {
      return json({ error: 'Telegram belum dikonfigurasi untuk workspace ini' }, 400)
    }

    let posts: any[]
    if (body?.post_id) {
      const r = await pool.query("SELECT * FROM posts WHERE id=$1 AND workspace_id=$2 AND review_status='pending'", [body.post_id, ws])
      posts = r.rows
    } else {
      const r = await pool.query("SELECT * FROM posts WHERE workspace_id=$1 AND review_status='pending' ORDER BY scheduled_at ASC", [ws])
      posts = r.rows
    }
    if (posts.length === 0) return json({ error: 'Tidak ada post pending' }, 404)

    const sent: any[] = []
    for (const p of posts) {
      const msg = await tgSend(workspace.telegram_bot_token, workspace.telegram_chat_id, reviewText(p))
      await pool.query('UPDATE posts SET telegram_message_id=$1 WHERE id=$2', [String(msg.message_id), p.id])
      sent.push({ id: p.id, message_id: msg.message_id })
    }
    return json({ sent: sent.length, items: sent })
  } catch (e: any) {
    console.error('[telegram-review] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}