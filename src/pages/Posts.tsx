import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Clock } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/dashboard/EmptyState'
import { StatusBadge } from '../components/dashboard/StatusBadge'
import { useWorkspace } from '../features/workspace/context'
import { listAccounts } from '../features/accounts/api'
import { listPosts, createPost, updatePost, deletePost } from '../features/posts/api'
import { Post } from '../features/posts/types'
import { PostForm, PostFormValues } from '../features/posts/PostForm'
import { useToast } from '../components/ui/toast'

export function PostsPage() {
  const toast = useToast()
  const { workspaces, selectedWorkspaceId } = useWorkspace()
  const [accounts, setAccounts] = useState<any[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [saving, setSaving] = useState(false)

  async function loadData() {
    try {
      setLoading(true)
      if (selectedWorkspaceId) {
        const [accs, psts] = await Promise.all([listAccounts(selectedWorkspaceId), listPosts(selectedWorkspaceId)])
        setAccounts(accs)
        setPosts(psts)
      } else {
        setAccounts([])
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

  async function handleCreate(values: PostFormValues) {
    if (!selectedWorkspaceId) return
    setSaving(true)
    try {
      await createPost({ workspace_id: selectedWorkspaceId, ...values })
      setCreateOpen(false)
      await loadData()
      toast.success('Post berhasil dibuat.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal membuat post')
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(values: PostFormValues) {
    if (!editingPost) return
    setSaving(true)
    try {
      await updatePost(editingPost.id, values)
      setEditOpen(false)
      setEditingPost(null)
      await loadData()
      toast.success('Post berhasil diperbarui.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal update post')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editingPost) return
    if (!confirm('Hapus post ini?')) return
    setSaving(true)
    try {
      await deletePost(editingPost.id)
      setEditOpen(false)
      setEditingPost(null)
      await loadData()
      toast.success('Post berhasil dihapus.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal hapus post')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(post: Post) {
    setEditingPost(post)
    setEditOpen(true)
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-semibold">Manajemen Post</h1>
            <p className="text-sm text-muted-foreground">Kelola konten untuk publishing</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!selectedWorkspaceId}>
            <Plus className="h-4 w-4 mr-2" /> Buat Post
          </Button>
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Daftar Post</CardTitle>
            <CardDescription>{posts.length} post</CardDescription>
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
            ) : posts.length === 0 ? (
              <EmptyState title="Belum ada post" description="Buat post pertama Anda untuk memulai." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Media</TH>
                    <TH>Caption</TH>
                    <TH className="hidden md:table-cell">Akun</TH>
                    <TH className="hidden sm:table-cell">Status</TH>
                    <TH className="hidden lg:table-cell">Dijadwalkan</TH>
                    <TH className="hidden md:table-cell">Dibuat</TH>
                    <TH>Aksi</TH>
                  </TR>
                </THead>
                <TBody>
                  {posts.map((post) => (
                    <TR key={post.id}>
                      <TD>
                        <div className="flex items-center gap-1">
                          {post.media_urls.slice(0, 3).map((u, i) => (
                            <img key={i} src={u} alt="" className="h-10 w-10 rounded border border-border object-cover" loading="lazy" />
                          ))}
                          {post.media_urls.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{post.media_urls.length - 3}</span>
                          )}
                        </div>
                      </TD>
                      <TD className="max-w-xs truncate">{post.caption || '(tanpa caption)'}</TD>
                      <TD className="hidden md:table-cell">{post.account_ids.length} akun</TD>
                      <TD className="hidden sm:table-cell">
                        <StatusBadge status={post.status} />
                      </TD>
                      <TD className="hidden lg:table-cell">
                        {post.scheduled_at ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(post.scheduled_at).toLocaleString('id-ID')}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TD>
                      <TD className="hidden md:table-cell">{new Date(post.created_at).toLocaleDateString('id-ID')}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(post)} title="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-danger hover:text-danger"
                            onClick={async () => {
                              if (!confirm('Hapus post ini?')) return
                              try {
                                await deletePost(post.id)
                                await loadData()
                                toast.success('Post berhasil dihapus.')
                              } catch (e: any) {
                                toast.error(e?.message || 'Gagal hapus post')
                              }
                            }}
                            title="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Post Baru</DialogTitle>
          </DialogHeader>
          <PostForm
            workspaces={workspaces}
            accounts={accounts}
            workspaceId={selectedWorkspaceId}
            submitLabel="Buat Post"
            saving={saving}
            onSubmit={handleCreate}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Post</DialogTitle>
          </DialogHeader>
          {editingPost && (
            <PostForm
              workspaces={workspaces}
              accounts={accounts}
              workspaceId={editingPost.workspace_id}
              initial={editingPost}
              submitLabel="Simpan"
              saving={saving}
              onSubmit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}