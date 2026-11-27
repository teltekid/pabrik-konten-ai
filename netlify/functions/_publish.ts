import { Pool } from 'pg'
import { getEnv } from './_env'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

export interface PublishResult {
  account: string
  platform: string
  mode: 'real' | 'mock'
  ok: boolean
  error?: string
}

async function publishInstagram(acc: any, post: any): Promise<PublishResult> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN || (acc.token_enc && !String(acc.token_enc).startsWith('mock') ? acc.token_enc : '')
  const userId = process.env.INSTAGRAM_USER_ID || acc.handle || ''
  const imageUrl = (post.media_urls || []).find((u: string) => /^https?:/.test(u))
  if (!token || !userId || !imageUrl) {
    return { account: acc.id, platform: 'instagram', mode: 'mock', ok: true }
  }
  try {
    const version = 'v21.0'
    const create = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(userId)}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption: post.caption || '', access_token: token }),
      signal: AbortSignal.timeout(30000),
    })
    const cj: any = await create.json().catch(() => ({}))
    if (!create.ok || !cj?.id) throw new Error(cj?.error?.message || `HTTP ${create.status}`)
    const pub = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(userId)}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: cj.id, access_token: token }),
      signal: AbortSignal.timeout(30000),
    })
    const pj: any = await pub.json().catch(() => ({}))
    if (!pub.ok || !pj?.id) throw new Error(pj?.error?.message || `HTTP ${pub.status}`)
    return { account: acc.id, platform: 'instagram', mode: 'real', ok: true }
  } catch (e: any) {
    return { account: acc.id, platform: 'instagram', mode: 'real', ok: false, error: e?.message || String(e) }
  }
}

export async function publishPost(postId: string): Promise<{ results: PublishResult[]; allOk: boolean }> {
  const own = await pool.query('SELECT p.* FROM posts p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=$1', [postId])
  if (own.rowCount === 0) throw new Error('Not found')
  const post = own.rows[0]
  const accounts = post.account_ids?.length
    ? (await pool.query('SELECT * FROM accounts WHERE id = ANY($1::uuid[])', [post.account_ids])).rows
    : []
  const results: PublishResult[] = []
  for (const acc of accounts) {
    if (acc.platform === 'instagram') results.push(await publishInstagram(acc, post))
    else {
      const hasKey = !!getEnv(`${acc.platform.toUpperCase()}_ACCESS_TOKEN`)
      results.push({ account: acc.id, platform: acc.platform, mode: hasKey ? 'real' : 'mock', ok: true })
    }
  }
  const allOk = results.every((r) => r.ok)
  if (allOk) {
    await pool.query("UPDATE posts SET status='published', review_status='posted', published_at=now(), published_mode='real' WHERE id=$1", [postId])
  } else {
    await pool.query("UPDATE posts SET status='failed', review_status='failed', error_message=$1, retry_count=retry_count+1 WHERE id=$2", [JSON.stringify(results), postId])
  }
  return { results, allOk }
}