import { BestTime } from './types'
import { cachedFetch, clearCache } from '../../lib/cache'

const BASE = '/.netlify/functions/best-times'

export async function listBestTimes(accountId: string): Promise<BestTime[]> {
  return cachedFetch(`besttimes:${accountId}`, async () => {
    const res = await fetch(`${BASE}?account_id=${accountId}`)
    if (!res.ok) throw new Error('Gagal memuat saran jam')
    return res.json()
  })
}

export async function generateBestTimes(accountId: string): Promise<{ ok: boolean; count: number; best_times: BestTime[] }> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId }),
  })
  if (!res.ok) throw new Error('Gagal membuat saran jam')
  clearCache(`besttimes:${accountId}`)
  return res.json()
}