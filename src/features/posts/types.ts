export type PostType = 'image' | 'carousel' | 'video_reel'
export type ReviewStatus = 'draft' | 'pending' | 'confirmed' | 'rejected' | 'posted' | 'failed'

export interface Post {
  id: string
  workspace_id: string
  account_ids: string[]
  caption: string | null
  media_urls: string[]
  hashtags: string[]
  first_comment: string | null
  location: string | null
  tags: string[]
  platform_overrides: Record<string, unknown>
  status: 'draft' | 'scheduled' | 'published' | 'failed'
  scheduled_at: string | null
  published_at: string | null
  error_message: string | null
  retry_count: number
  post_type: PostType
  topic: string | null
  media_prompt: string | null
  slide_count: number | null
  ai_provider: string | null
  review_status: ReviewStatus
  telegram_message_id: string | null
  published_mode: string | null
  created_at: string
  updated_at: string
}