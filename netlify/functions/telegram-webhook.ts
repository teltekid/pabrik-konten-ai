import { Pool } from 'pg'
import { getEnv } from './_env'
import { tgSend, escapeHtml, TgMessage } from './_telegram'
import { runGenerateBatch } from './generate-batch'
import { publishPost } from './_publish'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function typeLabel(t: string): string {
  if (t === 'carousel') return 'Carousel'
  if (t === 'video_reel') return 'Video Reel'
  return 'Gambar'
}

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const secret = getEnv('TELEGRAM_WEBHOOK_SECRET')
    if (secret) {
      const got = req.headers.get('x-telegram-bot-api-secret-token') || ''
      if (got !== secret) return json({ error: 'forbidden' }, 403)
    }

    const update: any = await req.json().catch(() => ({}))
    const msg: TgMessage | undefined = update?.message
    const text = String(msg?.text || '').trim()
    const chatId = msg?.chat?.id != null ? String(msg.chat.id) : ''
    if (!text || !chatId) return json({ ok: true, ignored: true })

    const wsRes = await pool.query('SELECT * FROM workspaces WHERE telegram_chat_id=$1 ORDER BY created_at LIMIT 1', [chatId])
    if (wsRes.rowCount === 0) return json({ ok: true, ignored: 'no workspace' })
    const ws = wsRes.rows[0]
    const token: string = ws.telegram_bot_token
    const lower = text.toLowerCase()

    // Cari post pending (by id bila ada, else terbaru)
    const idMatch = text.match(/#?([0-9a-f]{8})/i)
    let post: any = null
    if (idMatch) {
      const r = await pool.query("SELECT * FROM posts WHERE workspace_id=$1 AND review_status='pending' AND id::text LIKE $2 || '%'", [ws.id, idMatch[1]])
      post = r.rows[0] || null
    }
    if (!post) {
      const r = await pool.query("SELECT * FROM posts WHERE workspace_id=$1 AND review_status='pending' ORDER BY scheduled_at ASC LIMIT 1", [ws.id])
      post = r.rows[0] || null
    }

    if (lower.includes('perbaiki')) {
      if (!post) {
        await tgSend(token, chatId, 'Tidak ada konten pending untuk diperbaiki.')
        return json({ ok: true })
      }
      const date = post.scheduled_at ? new Date(post.scheduled_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) : undefined
      await pool.query("UPDATE posts SET review_status='draft' WHERE id=$1", [post.id])
      const res = await runGenerateBatch(ws.owner_id, { workspace_id: ws.id, date })
      const regen = res.items?.find((i: any) => i.id === post.id)
      if (!regen) {
        await tgSend(token, chatId, 'Gagal generate ulang. Coba lagi nanti.')
        return json({ ok: true, regenerated: false })
      }
      const fresh = await pool.query('SELECT * FROM posts WHERE id=$1', [post.id])
      const p = fresh.rows[0]
      const when = p.scheduled_at ? new Date(p.scheduled_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-'
      const review =
        `🔁 <b>Media diperbarui</b> #${String(p.id).slice(0, 8)}\n` +
        `📅 ${escapeHtml(when)} WIB\n📌 Tipe: <b>${typeLabel(p.post_type)}</b>\n🎯 ${escapeHtml(p.topic || '-')}\n\n` +
        `📝 <b>Caption:</b>\n${escapeHtml(String(p.caption || '-').slice(0, 800))}\n\n` +
        `🖼 Media: ${(p.media_urls || []).length} item\n\nBalas <b>confirm</b> untuk posting, atau <b>perbaiki</b> lagi.`
      const sent = await tgSend(token, chatId, review)
      await pool.query('UPDATE posts SET telegram_message_id=$1 WHERE id=$2', [String(sent.message_id), p.id])
      return json({ ok: true, regenerated: true })
    }

    if (lower.includes('confirm')) {
      if (!post) {
        await tgSend(token, chatId, 'Tidak ada konten pending untuk di-confirm.')
        return json({ ok: true })
      }
      const { results, allOk } = await publishPost(post.id)
      if (allOk) {
        const when = post.scheduled_at ? new Date(post.scheduled_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-'
        await tgSend(
          token,
          chatId,
          `✅ <b>SUKSES</b> diposting ke Instagram\n#${String(post.id).slice(0, 8)} · ${escapeHtml(when)} WIB\n${escapeHtml(post.topic || '')}`,
        )
      } else {
        await tgSend(token, chatId, `⚠️ Gagal posting: ${escapeHtml(JSON.stringify(results))}`)
      }
      return json({ ok: true, published: allOk, results })
    }

    await tgSend(token, chatId, 'Balas <b>confirm</b> atau <b>perbaiki</b>.')
    return json({ ok: true })
  } catch (e: any) {
    console.error('[telegram-webhook] error:', e)
    return json({ ok: true, error: e?.message || String(e) })
  }
}