import { CalendarPost, ImportResult, ImportRow } from './types'
import { cachedFetch, clearCache } from '../../lib/cache'

const BASE = '/.netlify/functions/calendar'

export async function listCalendar(workspaceId: string, from?: string, to?: string): Promise<CalendarPost[]> {
  const key = `calendar:${workspaceId}:${from || ''}:${to || ''}`
  return cachedFetch(key, async () => {
    const qs = new URLSearchParams({ workspace_id: workspaceId })
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    const res = await fetch(`${BASE}?${qs.toString()}`)
    if (!res.ok) throw new Error('Gagal memuat kalender')
    return res.json()
  })
}

export async function importCalendar(workspaceId: string, rows: ImportRow[]): Promise<ImportResult> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, rows }),
  })
  if (!res.ok) throw new Error('Gagal impor kalender')
  clearCache(`calendar:${workspaceId}`)
  clearCache(`posts:${workspaceId}`)
  return res.json()
}

export interface GenerateBatchResult {
  targetDate: string
  workspaceCount: number
  processed: number
  items: { id: string; topic: string | null; type: string; provider: string; mediaCount: number; mode: string; note?: string }[]
}

export async function generateBatch(workspaceId: string, date?: string): Promise<GenerateBatchResult> {
  const res = await fetch('/.netlify/functions/generate-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, date }),
  })
  if (!res.ok) {
    let msg = 'Gagal generate batch'
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {}
    throw new Error(msg)
  }
  clearCache(`calendar:${workspaceId}`)
  clearCache(`posts:${workspaceId}`)
  return res.json()
}