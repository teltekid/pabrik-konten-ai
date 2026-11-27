import { useState, useEffect } from 'react'
import { Send, RefreshCw } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/dashboard/EmptyState'
import { StatusBadge } from '../components/dashboard/StatusBadge'
import { useWorkspace } from '../features/workspace/context'
import { listPosts } from '../features/posts/api'
import { Post } from '../features/posts/types'
import { useToast } from '../components/ui/toast'

export function PublishPage() {
  const toast = useToast()
  const { selectedWorkspaceId } = useWorkspace()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [publishing, setPublishing] = useState<string | null>(null)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [selectedPostForSchedule, setSelectedPostForSchedule] = useState<Post | null>(null)
  const [scheduleAt, setScheduleAt] = useState('')

  const isBusy = (postId: string, action: string) => publishing === `${postId}:${action}`

  async function loadData() {
    try {
      setLoading(true)
      const wsId = selectedWorkspaceId
      if (wsId) {
        const psts = await listPosts(wsId)
        setPosts(psts)
      } else {
        setPosts([])
      }
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId])

  async function handlePublishNow(postId: string) {
    setPublishing(`${postId}:now`)
    try {
      const res = await fetch('/.netlify/functions/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, mode: 'now' }),
      })
      if (!res.ok) throw new Error('Gagal publish')
      await loadData()
      toast.success('Post berhasil dipublish sekarang.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal publish')
    } finally {
      setPublishing(null)
    }
  }

  async function handlePrioritize(postId: string) {
    setPublishing(`${postId}:prioritize`)
    try {
      const res = await fetch('/.netlify/functions/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, mode: 'prioritize' }),
      })
      if (!res.ok) throw new Error('Gagal prioritize')
      await loadData()
      toast.success('Post diprioritaskan untuk publishing.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal prioritize')
    } finally {
      setPublishing(null)
    }
  }

  async function handleSchedule(postId: string, scheduledAt: string) {
    setPublishing(`${postId}:schedule`)
    try {
      const res = await fetch('/.netlify/functions/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, mode: 'schedule', scheduled_at: scheduledAt }),
      })
      if (!res.ok) throw new Error('Gagal schedule')
      await loadData()
      toast.success('Post berhasil dijadwalkan.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal schedule')
    } finally {
      setPublishing(null)
    }
  }

  async function handleRealPublish(postId: string) {
    setPublishing(`${postId}:real`)
    try {
      const res = await fetch('/.netlify/functions/publish-real', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId }),
      })
      if (!res.ok) throw new Error('Gagal real publish')
      const result = await res.json()
      await loadData()
      toast.success(`Real publish selesai: ${JSON.stringify(result.results)}`)
    } catch (e: any) {
      toast.error(e?.message || 'Gagal real publish')
    } finally {
      setPublishing(null)
    }
  }

  async function handleAutoPost() {
    setPublishing('__auto__:auto')
    try {
      const res = await fetch('/.netlify/functions/auto-post', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Gagal auto-post')
      await loadData()
      toast.success(`Auto-post: ${j.published}/${j.checked} diposting.`)
    } catch (e: any) {
      toast.error(e?.message || 'Gagal auto-post')
    } finally {
      setPublishing(null)
    }
  }

  const availablePosts = posts.filter((p) => p.status === 'draft' || p.status === 'scheduled')

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-semibold">Publish & Jadwal Posting</h1>
            <p className="text-sm text-muted-foreground">Atur waktu posting dan trigger publishing otomatis</p>
          </div>
          <Button onClick={() => loadData()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button variant="soft" loading={isBusy('__auto__', 'auto')} loadingText="Memproses..." onClick={handleAutoPost}>
            <Send className="h-4 w-4 mr-2" /> Jalankan Auto-Post
          </Button>
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Post Siap Publish</CardTitle>
            <CardDescription>{availablePosts.length} post siap di-publish</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {error ? (
              <div className="p-6 text-sm text-danger">{error}</div>
            ) : loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : availablePosts.length === 0 ? (
              <EmptyState title="Tidak ada post siap publish" description="Buat post baru atau ganti status ke draft/scheduled." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Caption</TH>
                    <TH className="hidden md:table-cell">Akun</TH>
                    <TH className="hidden sm:table-cell">Status</TH>
                    <TH className="hidden md:table-cell">Jadwal</TH>
                    <TH>Aksi</TH>
                  </TR>
                </THead>
                <TBody>
                  {availablePosts.map((post) => (
                    <TR key={post.id}>
                      <TD className="max-w-xs truncate">
                        {post.caption || '(tanpa caption)'}
                      </TD>
                      <TD className="hidden md:table-cell">{post.account_ids.length} akun</TD>
                      <TD className="hidden sm:table-cell">
                        <StatusBadge status={post.status} />
                      </TD>
                      <TD className="hidden md:table-cell">
                        {post.scheduled_at ? (
                          <span className="flex items-center gap-1 text-sm">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {new Date(post.scheduled_at).toLocaleString('id-ID')}
                          </span>
                        ) : '-'}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="soft"
                            size="sm"
                            loading={isBusy(post.id, 'now')}
                            onClick={() => handlePublishNow(post.id)}
                            title="Publish Sekarang"
                          >
                            <Send className="h-3 w-3" />
                            <span className="hidden sm:inline">Sekarang</span>
                          </Button>
                          <Button
                            variant="soft"
                            size="sm"
                            loading={isBusy(post.id, 'prioritize')}
                            onClick={() => handlePrioritize(post.id)}
                            title="Prioritaskan"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            <span className="hidden sm:inline">Prioritaskan</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPostForSchedule(post)
                              setScheduleAt('')
                              setScheduleModalOpen(true)
                            }}
                            disabled={publishing === post.id}
                            title="Jadwalkan"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            loading={isBusy(post.id, 'real')}
                            onClick={() => handleRealPublish(post.id)}
                            title="Real Publish"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h8m-4-4v8M5 5h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" /></svg>
                            <span className="hidden sm:inline">Real</span>
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-0 z-50 bg-foreground/20" />
      {scheduleModalOpen && selectedPostForSchedule && (
        <div className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-surface p-6 shadow-soft">
          <div className="flex flex-col gap-1 text-left">
            <h3 className="font-serif text-lg font-semibold">Jadwalkan Posting</h3>
            <p className="text-sm text-muted-foreground">Post: {selectedPostForSchedule.caption?.slice(0, 40)}</p>
          </div>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Waktu & Tanggal</label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-soft"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setScheduleModalOpen(false)}>Batal</Button>
              <Button
                onClick={() => {
                  if (scheduleAt) {
                    handleSchedule(selectedPostForSchedule.id, scheduleAt)
                    setScheduleModalOpen(false)
                  }
                }}
                disabled={!scheduleAt}
              >
                Simpan Jadwal
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}