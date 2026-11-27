import { Workspace, BrandProfile } from './types'
import { cachedFetch, clearCache } from '../../lib/cache'

const BASE = '/.netlify/functions/workspaces'

export async function listWorkspaces(): Promise<Workspace[]> {
  return cachedFetch('workspaces', async () => {
    const res = await fetch(BASE)
    if (!res.ok) throw new Error('Gagal memuat workspace')
    return res.json()
  })
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const res = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  if (!res.ok) throw new Error('Gagal membuat workspace')
  clearCache('workspaces')
  return res.json()
}

export async function updateWorkspace(id: string, patch: Partial<Workspace>): Promise<Workspace> {
  const res = await fetch(`${BASE}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(msg?.error || `Gagal update workspace (HTTP ${res.status})`)
  }
  clearCache('workspaces')
  return res.json()
}

export async function deleteWorkspace(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Gagal hapus workspace')
  clearCache('workspaces')
}

export async function getBrandProfile(id: string): Promise<BrandProfile | null> {
  const res = await fetch(`${BASE}/${id}/brand-profile`)
  if (!res.ok) throw new Error('Gagal memuat brand profile')
  return res.json()
}

export async function saveBrandProfile(id: string, profile: Partial<BrandProfile>): Promise<BrandProfile> {
  const res = await fetch(`${BASE}/${id}/brand-profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) })
  if (!res.ok) throw new Error('Gagal menyimpan brand profile')
  return res.json()
}