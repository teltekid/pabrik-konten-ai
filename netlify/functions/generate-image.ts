import { auth } from './auth'
import { getEnv } from './_env'

async function getSession(req: Request) {
  const session = await (auth as any).api.getSession({ headers: req.headers })
  return session?.user ? session.user : null
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string))
}

// Baca dimensi gambar dari byte PNG/JPEG (untuk validasi anti "limit image").
function imageDims(b: Buffer): [number, number] | null {
  if (b.length < 24) return null
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)] // PNG
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) {
        o++
        continue
      }
      const m = b[o + 1]
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)] // JPEG SOF
      }
      o += 2 + b.readUInt16BE(o + 2)
    }
  }
  return null
}

// Pastikan rasio aspek gambar sesuai permintaan (tolak gambar "limit reached" yang ukurannya tetap).
function aspectMatch(b: Buffer, w: number, h: number): boolean {
  const d = imageDims(b)
  if (!d || d[0] === 0 || d[1] === 0) return false
  const target = w / h
  const actual = d[0] / d[1]
  return Math.abs(actual - target) / target <= 0.2
}

function placeholderSvg(prompt: string, w: number, h: number): string {
  const words = esc(prompt).split(/\s+/)
  const maxChars = Math.max(8, Math.floor(w / 26))
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > maxChars) {
      if (cur) lines.push(cur)
      cur = word
    } else {
      cur = (cur + ' ' + word).trim()
    }
  }
  if (cur) lines.push(cur)
  const shown = lines.slice(0, 12)
  const startY = h / 2 - (shown.length - 1) * 34
  const tspans = shown.map((ln, i) => `<tspan x="50%" y="${startY + i * 68}">${ln}</tspan>`).join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#1e2a5a"/><stop offset="1" stop-color="#3b5bdb"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `<text font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="700" fill="#ffffff" text-anchor="middle">${tspans}</text>` +
    `</svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

export default async (req: Request): Promise<Response> => {
  try {
    const user = await getSession(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const body = await req.json()
    const prompt = String(body?.prompt || '').trim()
    if (!prompt) return json({ error: 'prompt required' }, 400)
    const width = Math.min(Math.max(Number(body?.width) || 1080, 128), 2048)
    const height = Math.min(Math.max(Number(body?.height) || 1920, 128), 2048)

    // 1) Cloudflare Workers AI Flux (opt-in) — kualitas terbaik, free tier 10k neurons/hari
    const cfEnabled = (getEnv('CLOUDFLARE_IMAGE_ENABLED') || '').toLowerCase()
    const cfAcc = getEnv('CLOUDFLARE_ACCOUNT_ID')
    const cfTok = getEnv('CLOUDFLARE_API_TOKEN')
    if (['1', 'true', 'yes'].includes(cfEnabled) && cfAcc && cfTok) {
      try {
        const r = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${cfAcc}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${cfTok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
            signal: AbortSignal.timeout(30000),
          },
        )
        if (r.ok) {
          // Cloudflare mengembalikan JSON: { result: { image: "<base64 jpeg>" }, success: true }
          const j: any = await r.json()
          const b64 = j?.result?.image
          if (j?.success && typeof b64 === 'string' && b64.length > 100) {
            return json({ url: `data:image/jpeg;base64,${b64}`, mode: 'cloudflare' })
          }
        }
      } catch {
        /* lanjut fallback */
      }
    }

    // 2) Pollinations (gratis, tanpa key) — batasi 1 gambar/45 dtk, validasi rasio aspek
    let limited = false
    try {
      const seed = Math.floor(Math.random() * 1_000_000)
      const purl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`
      const r = await fetch(purl, { signal: AbortSignal.timeout(20000) })
      const ctype = r.headers.get('content-type') || ''
      if (r.ok && ctype.startsWith('image/')) {
        const buf = Buffer.from(await r.arrayBuffer())
        // Tolak gambar "limit reached" (rasio aspek tidak cocok / terlalu kecil)
        if (buf.length > 2000 && aspectMatch(buf, width, height)) {
          return json({ url: purl, mode: 'pollinations' })
        }
        limited = true
      } else {
        limited = r.status === 402 || r.status === 429 || r.status === 503
      }
    } catch {
      /* lanjut fallback */
    }

    // 3) Placeholder SVG lokal (selalu berhasil, menampilkan prompt)
    return json({
      url: placeholderSvg(prompt, width, height),
      mode: 'placeholder',
      note: limited
        ? 'Pollinations sedang dibatasi (1 gambar/45 detik). Menggunakan placeholder. Aktifkan Cloudflare untuk AI tanpa batas.'
        : undefined,
    })
  } catch (e: any) {
    console.error('[generate-image] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}