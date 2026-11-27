export interface Workspace {
  id: string
  owner_id: string
  name: string
  slug: string
  review_enabled: boolean
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  strategy: string | null
  created_at: string
  updated_at: string
}

export interface BrandProfile {
  id: string
  workspace_id: string
  name: string | null
  voice_tone: string | null
  writing_style: string | null
  target_audience: string | null
  key_offers: string[]
  hashtags: string[]
  dos: string[]
  donts: string[]
  example_posts: { text: string }[]
  created_at: string
  updated_at: string
}