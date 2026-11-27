export interface GeneratedImage {
  url: string
  mode: 'cloudflare' | 'pollinations' | 'placeholder'
  note?: string
}

const BASE = '/.netlify/functions/generate-image'

export async function generateImage(prompt: string, width = 1080, height = 1920): Promise<GeneratedImage> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, width, height }),
  })
  if (!res.ok) {
    let msg = 'Gagal generate gambar'
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {}
    throw new Error(msg)
  }
  return res.json()
}