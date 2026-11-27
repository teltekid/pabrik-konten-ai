import { Pool } from 'pg'
import { auth } from './auth'

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

const VALID_TYPES = ['image', 'carousel', 'video_reel']

function normalizeType(v: unknown): 'image' | 'carousel' | 'video_reel' {
  const s = String(v || '').toLowerCase().trim()
  if (['carousel', 'carousels', 'slide', 'slideshow'].includes(s)) return 'carousel'
  if (['video', 'video_reel', 'reel', 'reels', 'video reels', 'video_reels'].includes(s)) return 'video_reel'
  return 'image'
}

function normalizeStatus(v: unknown): 'draft' | 'scheduled' | 'published' | 'failed' {
  const s = String(v || '').toLowerCase().trim()
  if (['scheduled', 'schedule', 'terjadwal'].includes(s)) return 'scheduled'
  if (['published', 'publish', 'terbit'].includes(s)) return 'published'
  if (['failed', 'gagal'].includes(s)) return 'failed'
  return 'draft'
}

// Bangun ISO timestamptz dari tanggal (YYYY-MM-DD) + jam (HH:MM) dengan zona Jakarta GMT+7.
function toISO(date: string, time: string): string | null {
  const d = String(date || '').trim()
  const t = String(time || '').trim() || '09:00'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : '09:00'
  return `${d}T${hhmm}:00+07:00`
}

export default async (req: Request): Promise<Response> => {
  try {
    const user = await getSession(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const url = new URL(req.url)

    // GET: rentang kalender
    if (req.method === 'GET') {
      const ws = url.searchParams.get('workspace_id')
      if (!ws) return json({ error: 'workspace_id required' }, 400)
      const own = await pool.query('SELECT id FROM workspaces WHERE id=$1 AND owner_id=$2', [ws, user.id])
      if (own.rowCount === 0) return json({ error: 'Not found' }, 404)
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      const params: unknown[] = [ws]
      let where = 'workspace_id=$1'
      if (from) {
        params.push(from)
        where += ` AND scheduled_at >= $${params.length}`
      }
      if (to) {
        // inklusif sampai akhir hari
        params.push(`${to}T23:59:59+07:00`)
        where += ` AND scheduled_at <= $${params.length}`
      }
      const { rows } = await pool.query(
        `SELECT * FROM posts WHERE ${where} ORDER BY scheduled_at ASC NULLS LAST, created_at DESC`,
        params,
      )
      return json(rows)
    }

    // POST: import baris dari Excel (sudah diparse di klien)
    if (req.method === 'POST') {
      const body = await req.json()
      const ws = body?.workspace_id
      const own = await pool.query('SELECT id FROM workspaces WHERE id=$1 AND owner_id=$2', [ws, user.id])
      if (own.rowCount === 0) return json({ error: 'Not found' }, 404)

      const accRows = await pool.query('SELECT id,label,handle FROM accounts WHERE workspace_id=$1', [ws])
      const accounts = accRows.rows as { id: string; label: string; handle: string | null }[]
      const findAccount = (key: unknown): string | null => {
        const k = String(key || '').toLowerCase().trim()
        if (!k) return null
        const hit = accounts.find(
          (a) => a.label.toLowerCase() === k || (a.handle || '').toLowerCase() === k || (a.handle || '').replace('@', '').toLowerCase() === k.replace('@', ''),
        )
        return hit?.id ?? null
      }

      const rows = Array.isArray(body?.rows) ? body.rows : []
      let inserted = 0
      const errors: { index: number; error: string }[] = []
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {}
        const iso = toISO(r.date, r.time)
        if (!iso) {
          errors.push({ index: i, error: 'tanggal/jam tidak valid' })
          continue
        }
        const type = normalizeType(r.type)
        if (!VALID_TYPES.includes(type)) {
          errors.push({ index: i, error: 'tipe tidak valid' })
          continue
        }
        const accountId = findAccount(r.account)
        const status = normalizeStatus(r.status)
        try {
          await pool.query(
            `INSERT INTO posts
              (workspace_id,account_ids,post_type,topic,caption,media_urls,hashtags,first_comment,location,tags,media_prompt,scheduled_at,status,review_status,slide_count)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14)`,
            [
              ws,
              accountId ? [accountId] : [],
              type,
              r.topic ?? null,
              r.caption ?? null,
              Array.isArray(r.media_urls) ? r.media_urls : [],
              Array.isArray(r.hashtags) ? r.hashtags : [],
              r.first_comment ?? null,
              r.location ?? null,
              Array.isArray(r.tags) ? r.tags : [],
              r.media_prompt ?? null,
              iso,
              status,
              Number.isInteger(r.slide_count) && r.slide_count > 0 ? r.slide_count : null,
            ],
          )
          inserted++
        } catch (e: any) {
          errors.push({ index: i, error: e?.message || String(e) })
        }
      }
      return json({ inserted, skipped: rows.length - inserted, errors })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    console.error('[calendar] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}