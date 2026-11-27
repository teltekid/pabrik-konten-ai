import { Post } from '../posts/types'

export type CalendarPost = Post

export interface ImportRow {
  date: string
  time: string
  type: string
  topic?: string
  account?: string
  caption?: string
  media_urls?: string[]
  hashtags?: string[]
  first_comment?: string
  location?: string
  tags?: string[]
  media_prompt?: string
  status?: string
  slide_count?: number
}

export interface ImportResult {
  inserted: number
  skipped: number
  errors: { index: number; error: string }[]
}