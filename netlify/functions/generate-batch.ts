import { Pool } from 'pg'
import { auth } from './auth'
import { generateText, generateImage } from './_ai'

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

const TZ = 'Asia/Jakarta'
function jakartaDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}
function hMinus2(): string {
  return jakartaDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000))
}

function platformInstruction(accounts: { platform: string; handle: string | null }[]): string {
  const ig = accounts.find((a) => a.platform === 'instagram')
  if (ig) return `Posting untuk Instagram${ig.handle ? ' @' + ig.handle : ''}.`
  if (accounts[0]) return `Posting untuk ${accounts[0].platform}${accounts[0].handle ? ' @' + accounts[0].handle : ''}.`
  return 'Posting untuk media sosial.'
}

export interface GenerateBatchBody {
  workspace_id?: string
  date?: string
}

export async function runGenerateBatch(userId: string, body: GenerateBatchBody): Promise<any> {
  const targetDate = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : hMinus2()

  let workspaces: { id: string; name: string; strategy: string | null }[]
  if (body?.workspace_id) {
    const own = await pool.query('SELECT id,name,strategy FROM workspaces WHERE id=$1 AND owner_id=$2', [body.workspace_id, userId])
    if (own.rowCount === 0) throw new Error('Not found')
    workspaces = own.rows
  } else {
    const all = await pool.query('SELECT id,name,strategy FROM workspaces WHERE owner_id=$1 ORDER BY created_at', [userId])
    workspaces = all.rows
  }

  const items: any[] = []
  for (const ws of workspaces) {
    const bp = await pool.query('SELECT * FROM brand_profiles WHERE workspace_id=$1', [ws.id])
    const b = bp.rows[0] || {}
    const brandBits = [
      b.name ? `Nama brand: ${b.name}` : '',
      b.voice_tone ? `Nada suara: ${b.voice_tone}` : '',
      b.writing_style ? `Gaya tulisan: ${b.writing_style}` : '',
      b.target_audience ? `Target audiens: ${b.target_audience}` : '',
      Array.isArray(b.key_offers) && b.key_offers.length ? `Penawaran: ${b.key_offers.join(', ')}` : '',
      Array.isArray(b.hashtags) && b.hashtags.length ? `Hashtag wajib: ${b.hashtags.join(' ')}` : '',
      Array.isArray(b.dos) && b.dos.length ? `Lakukan: ${b.dos.join(', ')}` : '',
      Array.isArray(b.donts) && b.donts.length ? `Jangan: ${b.donts.join(', ')}` : '',
    ].filter(Boolean).join('\n')

    const posts = await pool.query(
      "SELECT * FROM posts WHERE workspace_id=$1 AND review_status='draft' ORDER BY scheduled_at ASC",
      [ws.id],
    )
    for (const p of posts.rows) {
      if (!p.scheduled_at) continue
      if (jakartaDate(new Date(p.scheduled_at)) !== targetDate) continue

      const accs = p.account_ids?.length
        ? (await pool.query('SELECT platform,handle FROM accounts WHERE id = ANY($1::uuid[])', [p.account_ids])).rows
        : []
      const platform = platformInstruction(accs)
      const typeLabel = p.post_type === 'carousel' ? 'carousel (3 slide)' : p.post_type === 'video_reel' ? 'video reel pendek' : 'gambar tunggal'
      const idea = p.topic || p.caption || '(buatkan ide menarik)'
      const strategy = (ws.strategy || '').trim()
      const textPrompt =
        'Anda perencana konten media sosial. Buat SATU konten postingan.\n' +
        'Jawab HANYA JSON valid: {"content": string, "imagePrompt": string}\n' +
        '- content: caption/isi siap posting, mulai dengan hook kuat.\n' +
        '- imagePrompt: prompt gambar Bahasa Inggris deskriptif untuk AI image generator.\n' +
        `Platform: ${platform}\nTipe: ${typeLabel}\n` +
        (strategy ? `Strategi konten (WAJIB dipatuhi, memengaruhi caption & imagePrompt): ${strategy}\n` : '') +
        (brandBits ? `Panduan brand:\n${brandBits}\n` : '') +
        `Topik/Ide: ${idea}`

      const strategySuffix = strategy ? ` Content strategy to follow strictly: ${strategy}` : ''

      let content = p.caption || ''
      let imagePrompt = ''
      let provider = ''
      try {
        const t = await generateText(textPrompt)
        content = content || t.content
        imagePrompt = t.imagePrompt
        provider = t.provider
      } catch (e: any) {
        provider = `gagal-teks: ${e?.message || e}`
      }

      const media: string[] = []
      let mode = ''
      const note: string[] = []
      try {
        if (p.post_type === 'carousel') {
          const slides = Number.isInteger(p.slide_count) && p.slide_count > 0 ? p.slide_count : 3
          for (let i = 0; i < slides; i++) {
            const im = await generateImage(`${imagePrompt || content} (slide ${i + 1}/${slides})${strategySuffix}`, 1080, 1080)
            media.push(im.url)
            mode = im.mode
            if (im.note) note.push(im.note)
          }
        } else if (p.post_type === 'video_reel') {
          const im = await generateImage(`${imagePrompt || content} (cover video)${strategySuffix}`, 1080, 1920)
          media.push(im.url)
          mode = im.mode
          note.push('Video reel: cover dibuat; render video menyusul via worker.')
        } else {
          const im = await generateImage(`${imagePrompt || content}${strategySuffix}`, 1080, 1920)
          media.push(im.url)
          mode = im.mode
          if (im.note) note.push(im.note)
        }
      } catch (e: any) {
        note.push(`gagal-gambar: ${e?.message || e}`)
      }

      await pool.query(
        "UPDATE posts SET caption=$1, media_urls=$2, media_prompt=$3, ai_provider=$4, review_status='pending' WHERE id=$5",
        [content || null, media, imagePrompt || null, provider || null, p.id],
      )
      items.push({ id: p.id, topic: p.topic, type: p.post_type, provider, mediaCount: media.length, mode, note: note.join(' ') || undefined })
    }
  }

  return { targetDate, workspaceCount: workspaces.length, processed: items.length, items }
}

export default async (req: Request): Promise<Response> => {
  try {
    const user = await getSession(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const body = await req.json().catch(() => ({}))
    const result = await runGenerateBatch(user.id, body)
    return json(result)
  } catch (e: any) {
    console.error('[generate-batch] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}