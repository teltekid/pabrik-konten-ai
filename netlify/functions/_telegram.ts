export interface TgMessage {
  message_id: number
  chat: { id: number }
  from?: { id: number }
  text?: string
  date: number
}

export async function tgSend(token: string, chatId: string, text: string): Promise<{ message_id: number }> {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j?.ok) throw new Error(`Telegram: ${j?.description || r.status}`)
  return { message_id: j.result.message_id }
}

export async function tgSetWebhook(token: string, url: string, secret?: string): Promise<void> {
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secret || undefined, allowed_updates: ['message'] }),
    signal: AbortSignal.timeout(15000),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j?.ok) throw new Error(`Telegram setWebhook: ${j?.description || r.status}`)
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}