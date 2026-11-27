import { useRef, useState } from 'react'
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react'
import { PostType } from './types'

export interface InstagramPreviewProps {
  postType: PostType
  mediaUrls: string[]
  caption: string
  hashtags: string[]
  location?: string
  accountLabel?: string
  handle?: string
}

function isVideoUrl(u: string): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(u)
}

function initial(name?: string): string {
  const s = (name || 'Pabrik Konten AI').trim()
  return s.charAt(0).toUpperCase()
}

export function InstagramPreview({ postType, mediaUrls, caption, hashtags, location, accountLabel, handle }: InstagramPreviewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [comment, setComment] = useState('')

  const account = accountLabel || 'Pabrik Konten AI'
  const username = handle ? handle.replace(/^@/, '') : account.toLowerCase().replace(/\s+/g, '_')
  const media = mediaUrls.filter(Boolean)
  const isCarousel = postType === 'carousel' || media.length > 1
  const single = media[0]
  const singleIsVideo = single ? isVideoUrl(single) : false

  function onScroll() {
    const el = scrollerRef.current
    if (!el) return
    setIdx(Math.round(el.scrollLeft / el.clientWidth))
  }
  function go(i: number) {
    const el = scrollerRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(i, media.length - 1))
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-xl border border-border bg-white text-neutral-900 shadow-soft">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-sm font-semibold text-white ring-2 ring-white">
          {initial(account)}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-semibold">{username}</span>
            <span className="text-xs text-neutral-500">• {location || 'Pabrik Konten'}</span>
          </div>
          <div className="truncate text-[11px] text-neutral-500">{account}</div>
        </div>
        <MoreHorizontal className="h-5 w-5 shrink-0 text-neutral-700" />
      </div>

      {/* Media */}
      <div className="relative bg-neutral-100">
        {media.length === 0 ? (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 text-neutral-400">
            <ImageIcon className="h-10 w-10" />
            <span className="text-xs">Belum ada media</span>
          </div>
        ) : isCarousel ? (
          <>
            <div
              ref={scrollerRef}
              onScroll={onScroll}
              className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
            >
              {media.map((u, i) =>
                isVideoUrl(u) ? (
                  <video key={i} src={u} controls className="aspect-square w-full shrink-0 snap-center object-cover" />
                ) : (
                  <img key={i} src={u} alt={`slide ${i + 1}`} className="aspect-square w-full shrink-0 snap-center object-cover" />
                ),
              )}
            </div>
            {media.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Sebelumnya"
                  onClick={() => go(idx - 1)}
                  disabled={idx === 0}
                  className="absolute left-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-neutral-800 shadow disabled:opacity-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Berikutnya"
                  onClick={() => go(idx + 1)}
                  disabled={idx >= media.length - 1}
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-neutral-800 shadow disabled:opacity-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                  {media.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Slide ${i + 1}`}
                      onClick={() => go(i)}
                      className={`h-1.5 w-1.5 rounded-full transition-colors ${i === idx ? 'bg-white' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
                <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                  {idx + 1}/{media.length}
                </span>
              </>
            )}
          </>
        ) : singleIsVideo ? (
          <video src={single} controls autoPlay loop className="aspect-square w-full object-cover" />
        ) : (
          <img src={single} alt="preview" className="aspect-square w-full object-cover" />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 px-3 pt-2">
        <button type="button" aria-label="Suka" onClick={() => setLiked((v) => !v)} className="transition-transform active:scale-90">
          <Heart className={`h-6 w-6 ${liked ? 'fill-red-500 text-red-500' : 'text-neutral-800'}`} />
        </button>
        <button type="button" aria-label="Komentar" className="transition-transform active:scale-90">
          <MessageCircle className="h-6 w-6 text-neutral-800" />
        </button>
        <button type="button" aria-label="Bagikan" className="transition-transform active:scale-90">
          <Send className="h-6 w-6 text-neutral-800" />
        </button>
        <button type="button" aria-label="Simpan" onClick={() => setSaved((v) => !v)} className="ml-auto transition-transform active:scale-90">
          <Bookmark className={`h-6 w-6 ${saved ? 'fill-neutral-800 text-neutral-800' : 'text-neutral-800'}`} />
        </button>
      </div>

      {/* Likes + caption */}
      <div className="space-y-1 px-3 pb-3 pt-1 text-sm">
        <p className="font-semibold">{liked ? '1.249' : '1.248'} suka</p>
        <p className="whitespace-pre-wrap break-words">
          <span className="font-semibold">{username}</span>{' '}
          <span>{caption || '(caption belum diisi)'}</span>
        </p>
        {hashtags.length > 0 && (
          <p className="break-words text-blue-600">
            {hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
          </p>
        )}
        <button type="button" className="text-neutral-500">Lihat semua 12 komentar</button>
        <div className="flex items-center gap-2 pt-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-[10px] font-semibold text-white">
            {initial(account)}
          </div>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && comment.trim()) setComment('')
            }}
            placeholder="Tambahkan komentar..."
            className="flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
          {comment.trim() && <button type="button" className="text-xs font-semibold text-blue-600">Unggah</button>}
        </div>
      </div>
    </div>
  )
}