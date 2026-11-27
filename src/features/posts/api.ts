import { Post } from './types'
import { cachedFetch, clearCache } from '../../lib/cache'
const BASE = '/.netlify/functions/posts'
export async function listPosts(ws: string): Promise<Post[]> {
  return cachedFetch(`posts:${ws}`, async () => {
    const res = await fetch(`${BASE}?workspace_id=${ws}`)
    if (!res.ok) throw new Error('Gagal memuat post')
    return res.json()
  })
}
export async function createPost(p: Partial<Post> & { workspace_id: string }): Promise<Post> {
  const res = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
  if (!res.ok) throw new Error('Gagal membuat post')
  clearCache(`posts:${p.workspace_id}`)
  return res.json()
}
export async function updatePost(id: string, patch: Partial<Post>): Promise<Post> {
  const res = await fetch(`${BASE}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
  if (!res.ok) throw new Error('Gagal update post')
  clearCache('posts:')
  return res.json()
}
export async function deletePost(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Gagal hapus post')
  clearCache('posts:')
}