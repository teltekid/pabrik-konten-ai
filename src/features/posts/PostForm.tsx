import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Post, PostType } from './types'
import { generateImage } from '../images/api'
import { generateContent } from '../content/api'
import { listBestTimes, generateBestTimes } from '../besttimes/api'
import { BestTime } from '../besttimes/types'
import { useToast } from '../../components/ui/toast'
import { InstagramPreview } from './InstagramPreview'
import { cn } from '../../lib/utils'

const FALLBACK_BEST_TIMES_2026: BestTime[] = [
  { id: 'f0', account_id: '', day_of_week: 0, time_slot: '21:00', score: 96, source: '2026', created_at: '' },
  { id: 'f1', account_id: '', day_of_week: 1, time_slot: '19:00', score: 90, source: '2026', created_at: '' },
  { id: 'f2', account_id: '', day_of_week: 2, time_slot: '19:00', score: 92, source: '2026', created_at: '' },
  { id: 'f3', account_id: '', day_of_week: 3, time_slot: '12:00', score: 98, source: '2026', created_at: '' },
  { id: 'f4', account_id: '', day_of_week: 4, time_slot: '09:00', score: 99, source: '2026', created_at: '' },
  { id: 'f5', account_id: '', day_of_week: 5, time_slot: '22:00', score: 84, source: '2026', created_at: '' },
  { id: 'f6', account_id: '', day_of_week: 6, time_slot: '21:00', score: 88, source: '2026', created_at: '' },
]

export interface PostFormValues {
  account_ids: string[]
  post_type: PostType
  topic: string | null
  caption: string | null
  media_prompt: string | null
  slide_count: number | null
  media_urls: string[]
  hashtags: string[]
  first_comment: string | null
  location: string | null
  tags: string[]
  status: 'draft' | 'scheduled' | 'published' | 'failed'
  scheduled_at: string | null
}

interface PostFormProps {
  workspaces: { id: string; name: string }[]
  accounts: { id: string; label: string; handle: string | null }[]
  workspaceId: string
  initial?: Post | null
  submitLabel?: string
  saving?: boolean
  showPreview?: boolean
  previewAccount?: { label?: string; handle?: string | null }
  onSubmit: (values: PostFormValues) => void | Promise<void>
  onDelete?: () => void | Promise<void>
}

function detectSlides(prompt: string): number {
  const up = prompt.toUpperCase()
  const m = up.match(/CAROUSEL\s+(\d+)/)
  if (m) return Math.max(1, Math.min(parseInt(m[1], 10), 20))
  const sc = prompt.match(/SLIDE\s*\d+/g)
  if (sc && sc.length) return sc.length
  return 0
}

function slidePrompts(prompt: string, count: number): string[] {
  if (count <= 1) return [prompt]
  const re = /(?:Slide|Scene)\s*\d+/gi
  const matches = [...prompt.matchAll(re)]
  if (matches.length >= 2) {
    const parts: string[] = []
    for (let i = 0; i < matches.length; i++) {
      const start = (matches[i].index || 0) + matches[i][0].length
      const end = i + 1 < matches.length ? matches[i + 1].index || prompt.length : prompt.length
      const seg = prompt.slice(start, end).replace(/^[\s:—–-]+/, '').replace(/\s*\/\s*$/, '').trim()
      if (seg) parts.push(seg)
    }
    if (parts.length) return parts.slice(0, count)
  }
  return Array.from({ length: count }, (_, i) => `${prompt} (slide ${i + 1}/${count})`)
}

function isVideoUrl(u: string): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(u)
}

function localYmd(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function PostForm({ workspaces, accounts, workspaceId, initial, submitLabel = 'Simpan', saving, showPreview, previewAccount, onSubmit, onDelete }: PostFormProps) {
  const toast = useToast()
  const [formAccountIds, setFormAccountIds] = useState<string[]>(initial?.account_ids || [])
  const [formPostType, setFormPostType] = useState<PostType>(initial?.post_type || 'image')
  const [formTopic, setFormTopic] = useState(initial?.topic || '')
  const [formCaption, setFormCaption] = useState(initial?.caption || '')
  const [formMediaPrompt, setFormMediaPrompt] = useState(initial?.media_prompt || '')
  const [formSlideCount, setFormSlideCount] = useState<number>(initial?.slide_count || detectSlides(initial?.media_prompt || '') || 3)
  const [formMediaUrls, setFormMediaUrls] = useState((initial?.media_urls || []).join('\n'))
  const [formHashtags, setFormHashtags] = useState((initial?.hashtags || []).join(', '))
  const [formFirstComment, setFormFirstComment] = useState(initial?.first_comment || '')
  const [formLocation, setFormLocation] = useState(initial?.location || '')
  const [formTags, setFormTags] = useState((initial?.tags || []).join(', '))
  const [formStatus, setFormStatus] = useState<PostFormValues['status']>(initial?.status || 'draft')
  const [formScheduledAt, setFormScheduledAt] = useState(initial?.scheduled_at ? new Date(initial.scheduled_at).toISOString().slice(0, 16) : '')

  const [formIdea, setFormIdea] = useState('')
  const [contentLoading, setContentLoading] = useState(false)
  const [contentProvider, setContentProvider] = useState<string | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)

  const [imgPrompt, setImgPrompt] = useState('')
  const [imgRatio, setImgRatio] = useState('9:16')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [regenLoading, setRegenLoading] = useState<number | null>(null)
  const [imgNote, setImgNote] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const [bestTimes, setBestTimes] = useState<BestTime[]>(FALLBACK_BEST_TIMES_2026)
  const [bestTimesLoading, setBestTimesLoading] = useState(false)

  const lastContentKey = useRef('')
  const lastImgKey = useRef('')
  const genImageRef = useRef<(prompt?: string) => void>(() => {})

  const mediaList = formMediaUrls.split('\n').map((s) => s.trim()).filter(Boolean)

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setPreview(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [preview])

  useEffect(() => {
    let alive = true
    const accountId = formAccountIds[0]
    if (!accountId) {
      setBestTimes(FALLBACK_BEST_TIMES_2026)
      return
    }
    setBestTimesLoading(true)
    listBestTimes(accountId)
      .then((rows) => {
        if (!alive) return
        if (rows.length) setBestTimes(rows)
        else
          generateBestTimes(accountId)
            .then((r) => alive && setBestTimes(r.best_times))
            .catch(() => alive && setBestTimes(FALLBACK_BEST_TIMES_2026))
      })
      .catch(() => alive && setBestTimes(FALLBACK_BEST_TIMES_2026))
      .finally(() => alive && setBestTimesLoading(false))
    return () => {
      alive = false
    }
  }, [formAccountIds])

  async function handleGenerateContent() {
    const idea = formIdea.trim()
    if (!idea) return
    setContentLoading(true)
    setContentError(null)
    try {
      const res = await generateContent(idea, '')
      setFormCaption(res.content)
      setImgPrompt(res.imagePrompt)
      setContentProvider(res.provider)
      lastContentKey.current = idea
      lastImgKey.current = ''
    } catch (e: any) {
      setContentError(e?.message || 'Gagal generate konten')
    } finally {
      setContentLoading(false)
    }
  }

  async function runGenerate(prompt: string, slides: number): Promise<string[]> {
    const prompts = slidePrompts(prompt, slides)
    const [rw, rh] = imgRatio === '1:1' ? [1080, 1080] : imgRatio === '16:9' ? [1920, 1080] : [1080, 1920]
    const urls: string[] = []
    let note = ''
    for (let i = 0; i < prompts.length; i++) {
      const res = await generateImage(prompts[i], rw, slides > 1 ? rw : rh)
      urls.push(res.url)
      if (res.note) note = res.note
    }
    if (note) setImgNote(note)
    return urls
  }

  async function handleGenerateAll() {
    const prompt = (imgPrompt || formMediaPrompt || formCaption).trim()
    if (!prompt) {
      toast.error('Masukkan prompt atau caption dulu')
      return
    }
    setBulkLoading(true)
    setImgNote(null)
    try {
      const slides = formPostType === 'carousel' ? Math.max(1, formSlideCount || 1) : 1
      const urls = await runGenerate(prompt, slides)
      setFormMediaUrls((prev) => (prev.trim() ? prev.trimEnd() + '\n' + urls.join('\n') : urls.join('\n')))
      setImgNote(`${urls.length} gambar dibuat.`)
    } catch (e: any) {
      toast.error(e?.message || 'Gagal generate gambar')
    } finally {
      setBulkLoading(false)
    }
  }
  genImageRef.current = () => handleGenerateAll()

  useEffect(() => {
    const content = formCaption.trim()
    const prompt = imgPrompt.trim()
    if (!content || !prompt) return
    if (prompt === lastImgKey.current) return
    if (bulkLoading || regenLoading !== null) return
    const t = setTimeout(() => {
      lastImgKey.current = prompt
      genImageRef.current(prompt)
    }, 800)
    return () => clearTimeout(t)
  }, [formCaption, imgPrompt, bulkLoading, regenLoading])

  async function regenerateOne(index: number) {
    const base = (formMediaPrompt || imgPrompt || formCaption).trim()
    if (!base) {
      toast.error('Isi Media Prompt atau Caption dulu')
      return
    }
    setRegenLoading(index)
    setImgNote(null)
    try {
      const isCarousel = formPostType === 'carousel'
      const count = isCarousel ? Math.max(1, formSlideCount || 3) : 1
      const prompts = slidePrompts(base, count)
      const p = isCarousel ? prompts[index] || prompts[prompts.length - 1] || base : base
      const [rw, rh] = imgRatio === '1:1' ? [1080, 1080] : imgRatio === '16:9' ? [1920, 1080] : [1080, 1920]
      const res = await generateImage(p, rw, isCarousel ? rw : rh)
      const list = mediaList.slice()
      if (index >= 0 && index < list.length) list[index] = res.url
      else list.push(res.url)
      setFormMediaUrls(list.join('\n'))
      setImgNote(isCarousel ? `Slide ${index + 1} diperbarui.` : 'Gambar diperbarui.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal generate ulang')
    } finally {
      setRegenLoading(null)
    }
  }

  function removeOne(index: number) {
    const list = mediaList.slice()
    list.splice(index, 1)
    setFormMediaUrls(list.join('\n'))
  }

  function submit() {
    onSubmit({
      account_ids: formAccountIds,
      post_type: formPostType,
      topic: formTopic || null,
      caption: formCaption || null,
      media_prompt: formMediaPrompt || null,
      slide_count: formPostType === 'carousel' ? Math.max(1, formSlideCount || 1) : null,
      media_urls: mediaList,
      hashtags: formHashtags.split(',').map((s) => s.trim()).filter(Boolean),
      first_comment: formFirstComment || null,
      location: formLocation || null,
      tags: formTags.split(',').map((s) => s.trim()).filter(Boolean),
      status: formStatus,
      scheduled_at: formScheduledAt || null,
    })
  }

  const bestTimeDay = formScheduledAt.slice(0, 10) || localYmd()
  const bestTimeDayIndex = new Date(`${bestTimeDay}T00:00:00`).getDay()
  const bestTimeChips = bestTimes.filter((b) => b.day_of_week === bestTimeDayIndex).sort((a, b) => b.score - a.score).slice(0, 3)
  function applyBestTime(time: string) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(formScheduledAt.slice(0, 10)) ? formScheduledAt.slice(0, 10) : localYmd()
    setFormScheduledAt(`${base}T${time}`)
  }

  const span = showPreview ? 'col-span-2' : ''
  const hashtagList = formHashtags.split(',').map((s) => s.trim()).filter(Boolean)

  return (
    <>
      <div className={cn('grid gap-6', showPreview && 'lg:grid-cols-[1fr_380px]')}>
        <div className={cn('grid gap-4', showPreview && 'grid-cols-2 content-start')}>
          <div className={cn('grid gap-2', span)}>
            <label className="text-sm font-medium">Workspace</label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
              {workspaces.find((w) => w.id === workspaceId)?.name || 'Workspace aktif'}
            </div>
            <p className="text-xs text-muted-foreground">Post dibuat untuk workspace aktif (pilih di kanan atas).</p>
          </div>

          <div className={cn('grid gap-2', span)}>
            <label className="text-sm font-medium">Akun Target (Ctrl+Click untuk pilih banyak)</label>
            <select
              multiple
              value={formAccountIds}
              onChange={(e) => setFormAccountIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
              className="h-24 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-soft"
              size={5}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.label} (@{acc.handle})</option>
              ))}
            </select>
          </div>

          <div className={cn('grid gap-2 rounded-md border border-accent/30 bg-accent/5 p-3', span)}>
            <label className="text-sm font-medium text-accent">Ide &amp; Hook — Klik Proses untuk AI membuat konten</label>
            <Input value={formIdea} onChange={(e) => setFormIdea(e.target.value)} placeholder="Ide + hook, contoh: 3 tips hemat waktu untuk UMKM — berhenti buang waktu untuk hal ini!" />
            <div>
              <Button type="button" variant="soft" loading={contentLoading} loadingText="Memproses..." onClick={handleGenerateContent} disabled={!formIdea.trim()}>
                Proses
              </Button>
            </div>
            {contentLoading && <p className="text-xs text-muted-foreground">AI sedang menulis konten...</p>}
            {contentError && <p className="text-xs text-danger">{contentError}</p>}
            {contentProvider && !contentLoading && (
              <p className="text-xs text-muted-foreground">Konten oleh {contentProvider}. Prompt gambar juga diisi otomatis.</p>
            )}
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Tipe Post</label>
            <select value={formPostType} onChange={(e) => setFormPostType(e.target.value as PostType)} className="h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-soft">
              <option value="image">Gambar</option>
              <option value="carousel">Carousel</option>
              <option value="video_reel">Video Reel</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Topik</label>
            <Input value={formTopic} onChange={(e) => setFormTopic(e.target.value)} placeholder="Topik singkat post" />
          </div>

          <div className={cn('grid gap-2', span)}>
            <label className="text-sm font-medium">Caption / Isi Konten</label>
            <textarea value={formCaption} onChange={(e) => setFormCaption(e.target.value)} rows={4} className="h-24 rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-soft" placeholder="Caption post..." />
          </div>

          <div className={cn('grid gap-2 rounded-md border border-accent/30 bg-accent/5 p-3', span)}>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-accent">Buat Gambar dengan AI</label>
            </div>
            <Input value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} placeholder="Prompt gambar (kosongkan untuk pakai caption)" />
            <div className="flex items-center gap-2">
              <select value={imgRatio} onChange={(e) => setImgRatio(e.target.value)} className="h-9 rounded-md border border-input bg-surface px-2 text-sm shadow-soft">
                <option value="9:16">9:16 (Potret)</option>
                <option value="1:1">1:1 (Persegi)</option>
                <option value="16:9">16:9 (Lanskap)</option>
              </select>
              <Button type="button" variant="soft" loading={bulkLoading} loadingText="Membuat..." onClick={handleGenerateAll}>
                Generate Gambar{formPostType === 'carousel' ? ` (${formSlideCount})` : ''}
              </Button>
            </div>

            {mediaList.length > 0 && (
              <div className={mediaList.length > 1 ? 'grid grid-cols-2 gap-2 md:grid-cols-3' : ''}>
                {mediaList.map((u, i) => (
                  <div key={i} className="group relative overflow-hidden rounded-md border border-border">
                    <button type="button" onClick={() => setPreview(u)} className="block w-full cursor-zoom-in">
                      {isVideoUrl(u) ? (
                        <div className="flex h-32 w-full items-center justify-center bg-black/40 text-[10px] text-white">▶ video</div>
                      ) : (
                        <img src={u} alt={`media ${i + 1}`} className={mediaList.length > 1 ? 'h-32 w-full object-cover' : 'max-h-56 w-auto'} />
                      )}
                    </button>
                    <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        title="Generate ulang slide ini"
                        disabled={regenLoading !== null || bulkLoading}
                        onClick={() => regenerateOne(i)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-50"
                      >
                        {regenLoading === i ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <span className="text-xs">⟳</span>}
                      </button>
                      <button
                        type="button"
                        title="Hapus gambar ini"
                        onClick={() => removeOne(i)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-danger"
                      >
                        ✕
                      </button>
                    </div>
                    {formPostType === 'carousel' && (
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Slide {i + 1}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {imgNote && <p className="text-xs text-accent">{imgNote}</p>}
          </div>

          <div className={cn('grid gap-2', span)}>
            <label className="text-sm font-medium">Media Prompt</label>
            <Input
              value={formMediaPrompt}
              onChange={(e) => {
                const v = e.target.value
                setFormMediaPrompt(v)
                if (formPostType === 'carousel') {
                  const d = detectSlides(v)
                  if (d) setFormSlideCount(d)
                }
              }}
              placeholder="Prompt untuk generate gambar/video"
            />
            {formPostType === 'carousel' && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Jumlah Slide</label>
                <Input type="number" min={1} max={20} value={formSlideCount} onChange={(e) => setFormSlideCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="h-8 w-24" />
                <span className="text-xs text-muted-foreground">dideteksi otomatis dari prompt (mis. "CAROUSEL 4")</span>
              </div>
            )}
          </div>

          <div className={cn('grid gap-2', span)}>
            <label className="text-sm font-medium">Media URLs (satu per baris)</label>
            <textarea value={formMediaUrls} onChange={(e) => setFormMediaUrls(e.target.value)} rows={3} className="h-20 rounded-md border border-input bg-surface px-3 py-2 text-sm font-mono shadow-soft" placeholder="https://example.com/image1.jpg&#10;https://example.com/video.mp4" />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Hashtags (pisah dengan koma)</label>
            <Input value={formHashtags} onChange={(e) => setFormHashtags(e.target.value)} placeholder="#bisnis #marketing #tips" />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">First Comment</label>
            <Input value={formFirstComment} onChange={(e) => setFormFirstComment(e.target.value)} placeholder="Komentar pertama..." />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Location</label>
            <Input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="Jakarta, Indonesia" />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Tags (pisah dengan koma)</label>
            <Input value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="tag1, tag2" />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Status</label>
            <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as any)} className="h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-soft">
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className={cn('grid gap-2', span)}>
            <label className="text-sm font-medium">Scheduled At</label>
            <input type="datetime-local" value={formScheduledAt} onChange={(e) => setFormScheduledAt(e.target.value)} className="h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-soft" />
            <div className="rounded-md border border-success/30 bg-success/5 p-2">
              <p className="text-xs font-medium text-success">
                Saran jam terbaik IG 2026 untuk {new Date(`${bestTimeDay}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long' })}
                {bestTimesLoading ? ' (memuat...)' : ''}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {bestTimeChips.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Belum ada saran.</span>
                ) : (
                  bestTimeChips.map((b) => (
                    <Button key={`${b.day_of_week}-${b.time_slot}`} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => applyBestTime(b.time_slot)}>
                      {b.time_slot}
                    </Button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className={cn('flex justify-between gap-2 pt-2 border-t border-border', span)}>
            <div>
              {onDelete && (
                <Button type="button" variant="danger" loading={saving} loadingText="Menghapus..." onClick={onDelete}>
                  Hapus
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" loading={saving} loadingText="Menyimpan..." onClick={submit}>
                {submitLabel}
              </Button>
            </div>
          </div>
        </div>

        {showPreview && (
          <div className="lg:sticky lg:top-0 h-fit">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview Instagram</span>
            </div>
            <InstagramPreview
              postType={formPostType}
              mediaUrls={mediaList}
              caption={formCaption}
              hashtags={hashtagList}
              location={formLocation || undefined}
              accountLabel={previewAccount?.label}
              handle={previewAccount?.handle ?? undefined}
            />
          </div>
        )}
      </div>

      {preview && (
        <div
          className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={(e) => {
            e.stopPropagation()
            setPreview(null)
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isVideoUrl(preview) ? (
            <video src={preview} controls autoPlay className="max-h-[90vh] max-w-[90vw] rounded-md" onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={preview} alt="preview" className="max-h-[90vh] max-w-[90vw] rounded-md object-contain" onClick={(e) => e.stopPropagation()} />
          )}
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation()
              setPreview(null)
            }}
          >
            Tutup
          </button>
        </div>
      )}
    </>
  )
}