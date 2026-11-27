import { getEnv } from './_env'

export interface TextResult {
  content: string
  imagePrompt: string
  provider: string
}

export interface ImageResult {
  url: string
  mode: 'cloudflare' | 'pollinations' | 'placeholder'
  note?: string
}

function providers() {
  const cfAcc = getEnv('CLOUDFLARE_ACCOUNT_ID')
  return [
    { name: 'groq', base: 'https://api.groq.com/openai/v1', key: getEnv('GROQ_API_KEY'), models: ['openai/gpt-oss-20b'] },
    { name: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: getEnv('GEMINI_API_KEY'), models: ['gemini-flash-latest', 'gemini-flash-lite-latest'] },
    { name: 'cloudflare', base: cfAcc ? `https://api.cloudflare.com/client/v4/accounts/${cfAcc}/ai/v1` : '', key: getEnv('CLOUDFLARE_API_TOKEN'), models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'] },
    { name: 'openrouter', base: 'https://openrouter.ai/api/v1', key: getEnv('OPENROUTER_API_KEY'), models: ['baidu/ernie-5.5-flash-preview:free', 'google/gemma-4-31b-it:free'] },
    { name: 'sambanova', base: 'https://api.sambanova.ai/v1', key: getEnv('SAMBANOVA_API_KEY'), models: ['Meta-Llama-3.3-70B-Instruct'] },
  ]
}

function parseJsonLoose(text: string): any {
  let t = text.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(t)
  } catch {
    const s = t.indexOf('{')
    const e = t.lastIndexOf('}')
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1))
    throw new Error('JSON tidak valid')
  }
}

async function callModel(base: string, key: string, model: string, prompt: string): Promise<string> {
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.7 }),
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`HTTP ${r.status}: ${body.slice(0, 160)}`)
  }
  const j: any = await r.json()
  const content = j?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('respons kosong')
  return content
}

export async function generateText(prompt: string): Promise<TextResult> {
  let lastErr = ''
  for (const p of providers()) {
    if (!p.key || !p.base) continue
    for (const model of p.models) {
      try {
        const raw = await callModel(p.base, p.key, model, prompt)
        const data = parseJsonLoose(raw)
        const content = typeof data?.content === 'string' ? data.content.trim() : ''
        const imagePrompt = typeof data?.imagePrompt === 'string' ? data.imagePrompt.trim() : ''
        if (content && imagePrompt) return { content, imagePrompt, provider: `${p.name}/${model}` }
        lastErr = 'field kosong'
      } catch (e: any) {
        lastErr = e?.message || String(e)
      }
    }
  }
  throw new Error(`Semua provider teks gagal: ${lastErr}`)
}

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string))
}

function imageDims(b: Buffer): [number, number] | null {
  if (b.length < 24) return null
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue }
      const m = b[o + 1]
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)]
      o += 2 + b.readUInt16BE(o + 2)
    }
  }
  return null
}
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
    } else cur = (cur + ' ' + word).trim()
  }
  if (cur) lines.push(cur)
  const shown = lines.slice(0, 12)
  const startY = h / 2 - (shown.length - 1) * 34
  const tspans = shown.map((ln, i) => `<tspan x="50%" y="${startY + i * 68}">${ln}</tspan>`).join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e2a5a"/><stop offset="1" stop-color="#3b5bdb"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/><text font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="700" fill="#ffffff" text-anchor="middle">${tspans}</text></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// Upload data URL base64 ke Supabase Storage (bucket publik 'media'); return URL publik atau null.
async function uploadDataUrl(dataUrl: string, ext: string): Promise<string | null> {
  const url = getEnv('SUPABASE_URL')
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  try {
    const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
    if (!m) return null
    const mime = m[1]
    const buf = Buffer.from(m[2], 'base64')
    const name = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const head = { Authorization: `Bearer ${key}` }
    const chk = await fetch(`${url}/storage/v1/bucket/media`, { headers: head })
    if (chk.status === 404) {
      await fetch(`${url}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...head, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'media', public: true }),
      })
    }
    const up = await fetch(`${url}/storage/v1/object/media/${name}`, {
      method: 'POST',
      headers: { ...head, 'Content-Type': mime, 'x-upsert': 'true' },
      body: buf,
    })
    if (!up.ok) return null
    return `${url}/storage/v1/object/public/media/${name}`
  } catch {
    return null
  }
}

export async function generateImage(prompt: string, width = 1080, height = 1920): Promise<ImageResult> {
  const cfEnabled = (getEnv('CLOUDFLARE_IMAGE_ENABLED') || '').toLowerCase()
  const cfAcc = getEnv('CLOUDFLARE_ACCOUNT_ID')
  const cfTok = getEnv('CLOUDFLARE_API_TOKEN')
  if (['1', 'true', 'yes'].includes(cfEnabled) && cfAcc && cfTok) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAcc}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfTok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(30000),
      })
      if (r.ok) {
        const j: any = await r.json()
        const b64 = j?.result?.image
        if (j?.success && typeof b64 === 'string' && b64.length > 100) {
          const dataUrl = `data:image/jpeg;base64,${b64}`
          const hosted = await uploadDataUrl(dataUrl, 'jpg')
          return { url: hosted || dataUrl, mode: 'cloudflare', note: hosted ? undefined : 'Disimpan sebagai base64 (unggah storage gagal).' }
        }
      }
    } catch { /* fallback */ }
  }

  let limited = false
  try {
    const seed = Math.floor(Math.random() * 1_000_000)
    const purl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`
    const r = await fetch(purl, { signal: AbortSignal.timeout(20000) })
    const ctype = r.headers.get('content-type') || ''
    if (r.ok && ctype.startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 2000 && aspectMatch(buf, width, height)) return { url: purl, mode: 'pollinations' }
      limited = true
    } else limited = r.status === 402 || r.status === 429 || r.status === 503
  } catch { /* fallback */ }

  return {
    url: placeholderSvg(prompt, width, height),
    mode: 'placeholder',
    note: limited ? 'Pollinations dibatasi (1 gambar/45 dtk). Menggunakan placeholder. Aktifkan Cloudflare untuk AI tanpa batas.' : undefined,
  }
}