import { Account } from './types'
import { cachedFetch, clearCache } from '../../lib/cache'
const BASE = '/.netlify/functions/accounts'
export async function listAccounts(ws: string): Promise<Account[]> {
  return cachedFetch(`accounts:${ws}`, async () => {
    const res = await fetch(`${BASE}?workspace_id=${ws}`)
    if (!res.ok) throw new Error('Gagal memuat akun')
    return res.json()
  })
}
export async function connectAccount(ws: string, platform: Account['platform'], label: string, handle?: string): Promise<Account> {
  const res = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: ws, platform, label, handle }) })
  if (!res.ok) throw new Error('Gagal connect akun')
  clearCache(`accounts:${ws}`)
  return res.json()
}
export async function updateAccount(id: string, patch: Partial<Account>): Promise<Account> {
  const res = await fetch(`${BASE}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
  if (!res.ok) throw new Error('Gagal update akun')
  clearCache('accounts:')
  return res.json()
}
export async function deleteAccount(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Gagal hapus akun')
  clearCache('accounts:')
}