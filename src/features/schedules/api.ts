import { Schedule } from './types'
import { cachedFetch, clearCache } from '../../lib/cache'
const BASE = '/.netlify/functions/schedules'
export async function listSchedules(account: string): Promise<Schedule[]> {
  return cachedFetch(`schedules:${account}`, async () => {
    const res = await fetch(`${BASE}?account_id=${account}`)
    if (!res.ok) throw new Error('Gagal')
    return res.json()
  })
}
export async function addSchedule(account: string, day: number, time: string): Promise<Schedule> {
  const res = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: account, day_of_week: day, time_slot: time }) })
  if (!res.ok) throw new Error('Gagal')
  clearCache(`schedules:${account}`)
  return res.json()
}
export async function removeSchedule(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Gagal')
  clearCache('schedules:')
}