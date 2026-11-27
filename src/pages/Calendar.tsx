import { useState, useEffect, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Upload, RefreshCw, ChevronLeft, ChevronRight, CalendarDays, Sparkles } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { EmptyState } from '../components/dashboard/EmptyState'
import { updateWorkspace } from '../features/workspace/api'
import { useWorkspace } from '../features/workspace/context'
import { listAccounts } from '../features/accounts/api'
import { listCalendar, importCalendar, generateBatch, GenerateBatchResult } from '../features/calendar/api'
import { CalendarPost, ImportRow, ImportResult } from '../features/calendar/types'
import { PostType } from '../features/posts/types'
import { updatePost, deletePost } from '../features/posts/api'
import { PostForm, PostFormValues } from '../features/posts/PostForm'
import { useToast } from '../components/ui/toast'

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const TZ = 'Asia/Jakarta'

function typeVariant(t: PostType): 'accent' | 'warning' | 'danger' {
  if (t === 'carousel') return 'warning'
  if (t === 'video_reel') return 'danger'
  return 'accent'
}
function typeLabel(t: PostType): string {
  if (t === 'carousel') return 'Carousel'
  if (t === 'video_reel') return 'Video Reel'
  return 'Gambar'
}
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function jakartaDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}
function jakartaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

const HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  date: ['tanggal', 'date', 'tgl', 'hari', 'day'],
  time: ['jam', 'time', 'waktu', 'hour'],
  type: ['tipe', 'type', 'jenis', 'format', 'tipe postingan'],
  topic: ['topik', 'topic', 'judul', 'tema', 'subject'],
  account: ['akun', 'account', 'ig', 'instagram', 'handle', 'akun ig'],
  caption: ['caption', 'keterangan', 'deskripsi', 'isi', 'content'],
  media_urls: ['media', 'media_url', 'media_urls', 'url', 'urls', 'gambar', 'image', 'images', 'link', 'file'],
  hashtags: ['hashtag', 'hashtags', 'tagar'],
  first_comment: ['first_comment', 'first comment', 'komentar pertama', 'comment'],
  location: ['location', 'lokasi', 'tempat'],
  tags: ['tags', 'tag', 'label'],
  media_prompt: ['media_prompt', 'media prompt', 'prompt', 'prompt gambar', 'image prompt'],
  status: ['status', 'state'],
  slide_count: [],
}

function pick(row: Record<string, unknown>, key: keyof ImportRow): string {
  const aliases = HEADER_ALIASES[key]
  for (const k of Object.keys(row)) {
    const norm = k.toLowerCase().trim()
    if (aliases.includes(norm)) {
      const v = row[k]
      return v == null ? '' : String(v).trim()
    }
  }
  return ''
}

function pickKey(row: Record<string, unknown>, key: keyof ImportRow): string {
  const aliases = HEADER_ALIASES[key]
  for (const k of Object.keys(row)) {
    if (aliases.includes(k.toLowerCase().trim())) return k
  }
  return ''
}

// Header spesifik format "Renungan / Planner IG"
const NF = {
  date: ['tanggal', 'tgl'],
  topic: ['1. judul renungan (hook)', 'judul renungan (hook)', 'judul renungan'],
  captionIg: ['caption ig'],
  isiRenungan: ['4. isi renungan', 'isi renungan'],
  ajakan: ['5. ajakan', 'ajakan'],
  prompt: ['6. prompt', 'prompt'],
  tipe: ['tipe posting', 'tipe postingan'],
  hashtag: ['hashtag', 'hashtags'],
  status: ['status'],
}

function pickByNames(row: Record<string, unknown>, names: string[]): string {
  for (const k of Object.keys(row)) {
    if (names.includes(k.toLowerCase().trim())) {
      const v = row[k]
      return v == null ? '' : String(v).trim()
    }
  }
  return ''
}

// Deteksi tipe post & jumlah slide dari kolom Prompt.
// REELS/VIDEO -> video_reel; CAROUSEL -> carousel (+hitung slide); selain itu -> image.
function detectPrompt(prompt: string): { type: PostType; slides: number } {
  const up = prompt.toUpperCase()
  if (/\bREELS?\b|\bVIDEO\b/.test(up)) return { type: 'video_reel', slides: 1 }
  if (/\bCAROUSEL\b/.test(up)) {
    let slides = 0
    const m = up.match(/CAROUSEL\s+(\d+)/)
    if (m) slides = parseInt(m[1], 10)
    if (!slides) {
      const sc = prompt.match(/SLIDE\s*\d+/g)
      slides = sc ? sc.length : 3
    }
    return { type: 'carousel', slides: Math.max(1, Math.min(slides, 20)) }
  }
  return { type: 'image', slides: 1 }
}

// Saran jam terbaik IG 2026 per hari (0=Minggu..6=Sabtu) — menimpa jam dari Excel.
const BEST_TIME_2026: Record<number, string> = {
  0: '21:00', 1: '19:00', 2: '19:00', 3: '12:00', 4: '09:00', 5: '22:00', 6: '21:00',
}
function bestTimeFor(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (isNaN(d.getTime())) return '09:00'
  return BEST_TIME_2026[d.getDay()] || '09:00'
}

function splitList(v: string): string[] {
  return v
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function normalizeDate(v: string): string {
  const s = v.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Excel serial number
  if (/^\d+(\.\d+)?$/.test(s)) {
    const parsed = XLSX.SSF.parse_date_code(Number(s))
    if (parsed) return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return ymd(d)
  return ''
}

export function CalendarPage() {
  const toast = useToast()
  const { workspaces, selectedWorkspaceId } = useWorkspace()
  const [accounts, setAccounts] = useState<any[]>([])
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [posts, setPosts] = useState<CalendarPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<GenerateBatchResult | null>(null)
  const [tgToken, setTgToken] = useState('')
  const [tgChat, setTgChat] = useState('')
  const [tgSaving, setTgSaving] = useState(false)
  const [tgMsg, setTgMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Edit post dari kalender
  const [editing, setEditing] = useState<CalendarPost | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const from = ymd(cursor)
  const to = ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))

  async function loadData() {
    try {
      setLoading(true)
      const wsId = selectedWorkspaceId
      if (wsId) {
        const [accs, psts] = await Promise.all([listAccounts(wsId), listCalendar(wsId, from, to)])
        setAccounts(accs)
        setPosts(psts)
      } else {
        setAccounts([])
        setPosts([])
      }
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat kalender')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId, cursor])

  useEffect(() => {
    const ws = workspaces.find((w) => w.id === selectedWorkspaceId)
    setTgToken(ws?.telegram_bot_token || '')
    setTgChat(ws?.telegram_chat_id || '')
  }, [selectedWorkspaceId, workspaces])

  function openEdit(p: CalendarPost) {
    setEditing(p)
  }

  async function saveEdit(values: PostFormValues) {
    if (!editing) return
    setEditSaving(true)
    try {
      const updated = await updatePost(editing.id, values)
      // Refresh hanya kartu tanggal terkait (update state lokal, tanpa reload seluruh kalender)
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      setEditing(null)
      toast.success('Post berhasil diperbarui.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal update post')
    } finally {
      setEditSaving(false)
    }
  }

  async function removeEditing() {
    if (!editing) return
    if (!confirm('Hapus post ini?')) return
    setEditSaving(true)
    try {
      await deletePost(editing.id)
      setPosts((prev) => prev.filter((p) => p.id !== editing.id))
      setEditing(null)
      toast.success('Post berhasil dihapus.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal hapus post')
    } finally {
      setEditSaving(false)
    }
  }

  const accountLabel = (id: string) => {
    const a = accounts.find((x) => x.id === id)
    return a ? `${a.label}${a.handle ? ' (@' + a.handle + ')' : ''}` : id.slice(0, 6)
  }
  // Nama akun untuk post: pakai akun tertaut; bila kosong, tampilkan akun workspace (yang sudah tertaut).
  const postAccountText = (p: CalendarPost): string => {
    if (p.account_ids && p.account_ids.length) return p.account_ids.map(accountLabel).join(', ')
    if (accounts.length) return accounts.map((a) => `${a.label}${a.handle ? ' (@' + a.handle + ')' : ''}`).join(', ')
    return 'tanpa akun'
  }

  const byDate = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {}
    for (const p of posts) {
      if (!p.scheduled_at) continue
      const d = jakartaDate(p.scheduled_at)
      ;(map[d] ||= []).push(p)
    }
    for (const d of Object.keys(map)) {
      map[d].sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''))
    }
    return map
  }, [posts])

  const cells = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const arr: (number | null)[] = []
    for (let i = 0; i < firstWeekday; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(d)
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [cursor])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedWorkspaceId) return
    setImporting(true)
    setResult(null)
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      const rows: ImportRow[] = raw.map((r) => {
        const used = new Set<string>()
        for (const key of Object.keys(HEADER_ALIASES) as (keyof ImportRow)[]) {
          const k = pickKey(r, key)
          if (k) used.add(k)
        }

        // Header spesifik format Renungan/Planner IG
        const nfPrompt = pickByNames(r, NF.prompt)
        const capIg = pickByNames(r, NF.captionIg)
        const isi = pickByNames(r, NF.isiRenungan)
        const ajakan = pickByNames(r, NF.ajakan)
        const nfTopic = pickByNames(r, NF.topic)
        const nfTipe = pickByNames(r, NF.tipe)
        const nfHashtag = pickByNames(r, NF.hashtag)
        const nfStatus = pickByNames(r, NF.status)
        const isNewFormat = Boolean(nfPrompt || capIg || isi || ajakan)

        let date = normalizeDate(pickByNames(r, NF.date) || pick(r, 'date'))
        if (!date) {
          for (const [k, v] of Object.entries(r)) {
            if (used.has(k)) continue
            const parsed = normalizeDate(v == null ? '' : String(v))
            if (parsed) {
              date = parsed
              used.add(k)
              break
            }
          }
        }

        const takeNext = (): string => {
          for (const [k, v] of Object.entries(r)) {
            if (used.has(k)) continue
            const s = v == null ? '' : String(v).trim()
            if (s) {
              used.add(k)
              return s
            }
          }
          return ''
        }

        // Caption gabungan: Caption IG (atas) + Isi Renungan + Ajakan (bawah)
        let topic = nfTopic || pick(r, 'topic')
        let caption = isNewFormat
          ? [capIg, isi, ajakan].filter(Boolean).join('\n\n')
          : pick(r, 'caption')
        if (!isNewFormat) {
          if (!topic) topic = takeNext()
          if (!caption) caption = takeNext()
        }

        // Prompt -> media_prompt + deteksi tipe & jumlah slide (Prompt otoritatif vs Tipe Posting)
        const prompt = nfPrompt || pick(r, 'media_prompt')
        let type = nfTipe || pick(r, 'type')
        let slideCount: number | undefined
        if (prompt) {
          const det = detectPrompt(prompt)
          type = det.type
          if (det.type === 'carousel') slideCount = det.slides
        }

        // Jam posting: selalu ditimpa saran jam terbaik berdasarkan tanggal
        const time = date ? bestTimeFor(date) : pick(r, 'time') || '09:00'

        let account = pick(r, 'account')
        if (!account) {
          for (const [k, v] of Object.entries(r)) {
            if (used.has(k)) continue
            const s = v == null ? '' : String(v).trim().toLowerCase()
            if (!s) continue
            const hit = accounts.find(
              (a) =>
                String(a.label || '').toLowerCase() === s ||
                String(a.handle || '').toLowerCase() === s ||
                String(a.handle || '').replace('@', '').toLowerCase() === s.replace('@', ''),
            )
            if (hit) {
              account = String(v).trim()
              used.add(k)
              break
            }
          }
        }

        return {
          date,
          time,
          type: type || 'image',
          topic: topic || undefined,
          account: account || undefined,
          caption: caption || undefined,
          media_urls: splitList(pick(r, 'media_urls')),
          hashtags: splitList(nfHashtag || pick(r, 'hashtags')),
          first_comment: pick(r, 'first_comment') || undefined,
          location: pick(r, 'location') || undefined,
          tags: splitList(pick(r, 'tags')),
          media_prompt: prompt || undefined,
          status: nfStatus || pick(r, 'status') || undefined,
          slide_count: slideCount,
        }
      })
      const res = await importCalendar(selectedWorkspaceId, rows)
      setResult(res)
      await loadData()
      toast.success(`Impor selesai: ${res.inserted} jadwal ditambahkan, ${res.skipped} dilewati.`)
    } catch (e: any) {
      const msg = e?.message || 'Gagal impor Excel'
      setError(msg)
      toast.error(msg)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function shiftMonth(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))
  }

  async function handleGenerate() {
    if (!selectedWorkspaceId) return
    setGenerating(true)
    setGenResult(null)
    setError(null)
    try {
      const res = await generateBatch(selectedWorkspaceId)
      setGenResult(res)
      await loadData()
      toast.success(`Generate H-2 (${res.targetDate}): ${res.processed} postingan diproses.`)
    } catch (e: any) {
      const msg = e?.message || 'Gagal generate'
      setError(msg)
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  async function saveTelegram() {
    if (!selectedWorkspaceId) return
    setTgSaving(true)
    setTgMsg(null)
    try {
      await updateWorkspace(selectedWorkspaceId, { telegram_bot_token: tgToken, telegram_chat_id: tgChat })
      setTgMsg('Konfigurasi Telegram disimpan.')
      await loadData()
      toast.success('Konfigurasi Telegram disimpan.')
    } catch (e: any) {
      const msg = e?.message || 'Gagal simpan'
      setTgMsg(msg)
      toast.error(msg)
    } finally {
      setTgSaving(false)
    }
  }

  async function sendReview() {
    if (!selectedWorkspaceId) return
    setTgSaving(true)
    setTgMsg(null)
    try {
      const res = await fetch('/.netlify/functions/telegram-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: selectedWorkspaceId }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Gagal kirim review')
      setTgMsg(`Review terkirim ke Telegram (${j.sent} pesan).`)
      toast.success(`Review terkirim ke Telegram (${j.sent} pesan).`)
    } catch (e: any) {
      const msg = e?.message || 'Gagal kirim review'
      setTgMsg(msg)
      toast.error(msg)
    } finally {
      setTgSaving(false)
    }
  }

  async function setupWebhook() {
    if (!selectedWorkspaceId) return
    setTgSaving(true)
    setTgMsg(null)
    try {
      const res = await fetch('/.netlify/functions/telegram-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: selectedWorkspaceId }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Gagal set webhook')
      setTgMsg(`Webhook Telegram diset: ${j.url}`)
      toast.success(`Webhook Telegram diset: ${j.url}`)
    } catch (e: any) {
      const msg = e?.message || 'Gagal set webhook'
      setTgMsg(msg)
      toast.error(msg)
    } finally {
      setTgSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Kalender Konten</h1>
          <p className="text-sm text-muted-foreground">Unggah Excel untuk mengisi jadwal, tipe, topik, dan jam posting</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          <Button variant="outline" onClick={() => loadData()} loading={loading} loadingText="Memuat...">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button onClick={() => fileRef.current?.click()} loading={importing} loadingText="Mengimpor..." disabled={!selectedWorkspaceId}>
            <Upload className="h-4 w-4 mr-2" /> Unggah Excel
          </Button>
          <Button onClick={handleGenerate} loading={generating} loadingText="Memproses..." disabled={!selectedWorkspaceId}>
            <Sparkles className="h-4 w-4 mr-2" /> Generate H-2
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integrasi Telegram (Review)</CardTitle>
          <CardDescription>Hubungkan bot Telegram untuk review konten &amp; laporan SUKSES</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Bot Token</label>
            <Input value={tgToken} onChange={(e) => setTgToken(e.target.value)} placeholder="123456:ABC-DEF..." />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium">Chat ID</label>
            <Input value={tgChat} onChange={(e) => setTgChat(e.target.value)} placeholder="-1001234567890" />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button variant="outline" loading={tgSaving} loadingText="Menyimpan..." onClick={saveTelegram} disabled={!selectedWorkspaceId}>Simpan</Button>
            <Button variant="soft" loading={tgSaving} loadingText="Memproses..." onClick={sendReview} disabled={!selectedWorkspaceId}>Kirim Review</Button>
            <Button variant="outline" loading={tgSaving} loadingText="Memproses..." onClick={setupWebhook} disabled={!selectedWorkspaceId}>Set Webhook</Button>
          </div>
          {tgMsg && <p className="text-xs text-muted-foreground md:col-span-2">{tgMsg}</p>}
        </CardContent>
      </Card>

      {result && (
        <div className="rounded-lg border border-success/20 bg-success/10 p-4 text-sm text-success">Impor selesai: {result.inserted} jadwal ditambahkan, {result.skipped} dilewati.
          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer">{result.errors.length} baris bermasalah</summary>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {result.errors.slice(0, 10).map((er, i) => (
                  <li key={i}>Baris {er.index + 2}: {er.error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {genResult && (
        <div className="rounded-lg border border-accent/20 bg-accent/10 p-4 text-sm text-accent">
          Generate H-2 ({genResult.targetDate}): {genResult.processed} postingan diproses.
          {genResult.items.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {genResult.items.slice(0, 10).map((it) => (
                <li key={it.id}>
                  {it.topic || '(tanpa topik)'} — {it.type}, {it.mediaCount} media, {it.provider}
                  {it.note ? ` — ${it.note}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" /> {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} title="Bulan sebelumnya">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
                Hari ini
              </Button>
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} title="Bulan berikutnya">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-danger">{error}</div>
          ) : loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !selectedWorkspaceId ? (
            <div className="p-6">
              <EmptyState title="Belum ada workspace" description="Buat workspace dan akun IG terlebih dahulu." />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px border-t border-border bg-border">
              {DAYS.map((d) => (
                <div key={d} className="bg-muted/40 px-2 py-1 text-center text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <div key={i} className="min-h-24 bg-surface" />
                const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(day)}`
                const items = byDate[key] || []
                return (
                  <div key={i} className="min-h-24 bg-surface p-1">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">{day}</div>
                    <div className="space-y-1">
                      {items.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => openEdit(p)}
                          title="Klik untuk edit post"
                          className="w-full rounded border border-border bg-muted/30 p-1 text-left transition-colors hover:border-accent/50 hover:bg-accent/10"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] tabular text-muted-foreground">{p.scheduled_at ? jakartaTime(p.scheduled_at) : '--'}</span>
                            <Badge variant={typeVariant(p.post_type)} className="px-1 py-0 text-[10px]">
                              {typeLabel(p.post_type)}
                            </Badge>
                          </div>
                          <div className="truncate text-[11px] font-medium" title={p.topic || p.caption || ''}>
                            {p.topic || p.caption || '(tanpa topik)'}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {postAccountText(p)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Format Excel yang dikenali: <code>Tanggal</code>, <code>1. Judul Renungan (Hook)</code>, <code>Caption IG</code>, <code>4. Isi Renungan</code>, <code>5. Ajakan</code>, <code>6. Prompt</code>, <code>Tipe Posting</code>, <code>Jam Posting (WIB)</code>, <code>Hashtag</code>, <code>Status</code>. Caption = Caption IG + Isi Renungan + Ajakan. Tipe post &amp; jumlah slide carousel dideteksi otomatis dari <code>Prompt</code> (REELS/CAROUSEL/GAMBAR). Jam posting ditimpa saran jam terbaik. Zona waktu: Jakarta (GMT+7).
      </p>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="max-w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail / Edit Post</DialogTitle>
          </DialogHeader>
          {editing && (
            <PostForm
              workspaces={workspaces}
              accounts={accounts}
              workspaceId={editing.workspace_id}
              initial={editing}
              submitLabel="Simpan"
              saving={editSaving}
              showPreview
              previewAccount={(() => {
                const id = editing.account_ids?.[0]
                const acc = id ? accounts.find((a) => a.id === id) : accounts[0]
                return { label: acc?.label, handle: acc?.handle }
              })()}
              onSubmit={saveEdit}
              onDelete={removeEditing}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}