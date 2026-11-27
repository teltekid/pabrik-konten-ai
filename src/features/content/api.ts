export interface GeneratedContent {
  content: string
  imagePrompt: string
  provider: string
}

const BASE = '/.netlify/functions/generate-content'

export async function generateContent(idea: string, hook: string, language = 'id-ID'): Promise<GeneratedContent> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, hook, language }),
  })
  if (!res.ok) {
    let msg = 'Gagal generate konten'
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {}
    throw new Error(msg)
  }
  return res.json()
}