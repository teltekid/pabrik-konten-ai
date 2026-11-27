import { auth } from './auth'
import { getEnv } from './_env'

async function getSession(req: Request) {
  const session = await (auth as any).api.getSession({ headers: req.headers })
  return session?.user ? session.user : null
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

// Rantai provider teks (reasoning) — TERPISAH dari jalur gambar (Cloudflare Flux).
// Urutan: Gemini -> Groq -> Cloudflare -> SambaNova -> OpenRouter.
function providers() {
  const cfAcc = getEnv('CLOUDFLARE_ACCOUNT_ID')
  return [
    {
      name: 'groq',
      base: 'https://api.groq.com/openai/v1',
      key: getEnv('GROQ_API_KEY'),
      models: ['openai/gpt-oss-20b'],
    },
    {
      name: 'gemini',
      base: 'https://generativelanguage.googleapis.com/v1beta/openai',
      key: getEnv('GEMINI_API_KEY'),
      models: ['gemini-flash-latest', 'gemini-flash-lite-latest'],
    },
    {
      name: 'cloudflare',
      base: cfAcc ? `https://api.cloudflare.com/client/v4/accounts/${cfAcc}/ai/v1` : '',
      key: getEnv('CLOUDFLARE_API_TOKEN'),
      models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
    },
    {
      name: 'openrouter',
      base: 'https://openrouter.ai/api/v1',
      key: getEnv('OPENROUTER_API_KEY'),
      models: ['baidu/ernie-5.5-flash-preview:free', 'google/gemma-4-31b-it:free'],
    },
    {
      name: 'sambanova',
      base: 'https://api.sambanova.ai/v1',
      key: getEnv('SAMBANOVA_API_KEY'),
      models: ['Meta-Llama-3.3-70B-Instruct'],
    },
  ]
}

function parseJsonLoose(text: string): any {
  let t = text.trim()
  t = t.replace(/^```json/i, '').replace(/^```/i, '').replace(/```\s*$/, '').trim()
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
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
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

export default async (req: Request): Promise<Response> => {
  try {
    const user = await getSession(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const body = await req.json()
    const idea = String(body?.idea || '').trim()
    const hook = String(body?.hook || '').trim()
    const language = String(body?.language || 'id-ID').trim() || 'id-ID'
    if (!idea) return json({ error: 'idea required' }, 400)

    const prompt =
      'Anda adalah penulis konten media sosial. Buatkan SATU konten postingan berdasarkan ide dan hook berikut.\n' +
      'Jawab HANYA JSON valid (tanpa teks lain) dengan struktur:\n' +
      '{"content": string, "imagePrompt": string}\n' +
      '- content: isi/caption konten yang menarik, mulai dengan hook, jelas dan siap posting.\n' +
      '- imagePrompt: prompt gambar dalam BAHASA INGGRIS yang deskriptif dan relevan dengan konten, cocok untuk AI image generator (sebutkan subjek, gaya, warna, komposisi).\n' +
      `Bahasa konten: ${language}.\n` +
      `Ide: ${idea}\n` +
      `Hook: ${hook || '(buatkan hook yang kuat sendiri)'}`

    let lastErr = ''
    const failures: string[] = []
    for (const p of providers()) {
      const keyLen = (p.key || '').length
      console.log(`[gen-content] provider ${p.name} keyLen=${keyLen} base=${p.base ? 'yes' : 'no'}`)
      if (!p.key || !p.base) continue
      for (const model of p.models) {
        try {
          const raw = await callModel(p.base, p.key, model, prompt)
          const data = parseJsonLoose(raw)
          const content = typeof data?.content === 'string' ? data.content.trim() : ''
          const imagePrompt = typeof data?.imagePrompt === 'string' ? data.imagePrompt.trim() : ''
          if (content && imagePrompt) {
            return json({ content, imagePrompt, provider: `${p.name}/${model}` })
          }
          lastErr = 'field content/imagePrompt kosong'
          failures.push(`${p.name}/${model}: kosong`)
        } catch (e: any) {
          lastErr = e?.message || String(e)
          const msg = String(lastErr).slice(0, 120)
          console.log(`[gen-content] ${p.name}/${model} gagal: ${msg}`)
          failures.push(`${p.name}/${model}: ${msg}`)
        }
      }
    }
    return json({ error: `Semua provider teks gagal: ${lastErr}`, failures }, 502)
  } catch (e: any) {
    console.error('[generate-content] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}