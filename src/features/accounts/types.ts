export interface Account {
  id: string
  workspace_id: string
  platform: 'instagram' | 'tiktok' | 'youtube' | 'threads'
  label: string
  handle: string | null
  status: 'connected' | 'expired' | 'error'
  created_at: string
  updated_at: string
}