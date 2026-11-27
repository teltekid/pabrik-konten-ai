import { useState, useEffect } from 'react'
import { Plus, Edit, Settings, Building2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/dashboard/EmptyState'
import { listWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace, getBrandProfile, saveBrandProfile } from '../features/workspace/api'
import { Workspace, BrandProfile } from '../features/workspace/types'
import { useToast } from '../components/ui/toast'

export function WorkspacesPage() {
  const toast = useToast()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [brandOpen, setBrandOpen] = useState(false)

  const [formName, setFormName] = useState('')
  const [formReviewEnabled, setFormReviewEnabled] = useState(false)
  const [formStrategy, setFormStrategy] = useState('')
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)

  const [brandForm, setBrandForm] = useState<Partial<BrandProfile>>({})
  const [brandExampleText, setBrandExampleText] = useState('')
  const [brandSaving, setBrandSaving] = useState(false)
  const [brandError, setBrandError] = useState<string | null>(null)

  async function loadWorkspaces() {
    try {
      setLoading(true)
      const data = await listWorkspaces()
      setWorkspaces(data)
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat workspace')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkspaces()
  }, [])

  async function loadBrandProfile(ws: Workspace) {
    setSelectedWorkspace(ws)
    setBrandError(null)
    try {
      const profile = await getBrandProfile(ws.id)
      if (profile) {
        setBrandForm({
          name: profile.name,
          voice_tone: profile.voice_tone,
          writing_style: profile.writing_style,
          target_audience: profile.target_audience,
          key_offers: profile.key_offers,
          hashtags: profile.hashtags,
          dos: profile.dos,
          donts: profile.donts,
          example_posts: profile.example_posts,
        })
        setBrandExampleText(JSON.stringify(profile.example_posts || [], null, 2))
      } else {
        setBrandForm({})
        setBrandExampleText('[]')
      }
      setBrandOpen(true)
    } catch (e: any) {
      const msg = e?.message || 'Gagal memuat brand profile'
      setBrandError(msg)
      toast.error(msg)
    }
  }

  async function handleCreate() {
    if (!formName.trim()) return
    try {
      await createWorkspace(formName.trim())
      setCreateOpen(false)
      setFormName('')
      setFormReviewEnabled(false)
      setFormStrategy('')
      await loadWorkspaces()
      toast.success(`Workspace "${formName.trim()}" berhasil dibuat.`)
    } catch (e: any) {
      toast.error(e?.message || 'Gagal membuat workspace')
    }
  }

  async function handleEdit() {
    if (!editingWorkspace || !formName.trim()) return
    try {
      await updateWorkspace(editingWorkspace.id, { name: formName.trim(), review_enabled: formReviewEnabled, strategy: formStrategy.trim() || null })
      setEditOpen(false)
      setEditingWorkspace(null)
      setFormName('')
      setFormReviewEnabled(false)
      setFormStrategy('')
      await loadWorkspaces()
      toast.success('Workspace berhasil diperbarui.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal update workspace')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus workspace ini? Tindakan tidak bisa dibatalkan.')) return
    try {
      await deleteWorkspace(id)
      if (selectedWorkspace?.id === id) {
        setSelectedWorkspace(null)
      }
      await loadWorkspaces()
      toast.success('Workspace berhasil dihapus.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal hapus workspace')
    }
  }

  async function handleSaveBrand() {
    if (!selectedWorkspace) return
    setBrandSaving(true)
    setBrandError(null)
    try {
      await saveBrandProfile(selectedWorkspace.id, brandForm)
      setBrandOpen(false)
      setBrandError(null)
      toast.success('Brand profile berhasil disimpan.')
    } catch (e: any) {
      const msg = e?.message || 'Gagal menyimpan brand profile'
      setBrandError(msg)
      toast.error(msg)
    } finally {
      setBrandSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-semibold">Manajemen Workspace</h1>
            <p className="text-sm text-muted-foreground">Kelola workspace dan brand profile Anda</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Buat Workspace
          </Button>
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Daftar Workspace</CardTitle>
            <CardDescription>{workspaces.length} workspace</CardDescription>
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
            ) : workspaces.length === 0 ? (
              <EmptyState title="Belum ada workspace" description="Buat workspace pertama Anda untuk memulai." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Workspace</TH>
                    <TH>Slug</TH>
                    <TH className="hidden md:table-cell">Review</TH>
                    <TH className="hidden md:table-cell">Dibuat</TH>
                    <TH>Aksi</TH>
                  </TR>
                </THead>
                <TBody>
                  {workspaces.map((ws) => (
                    <TR key={ws.id}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{ws.name}</span>
                        </div>
                      </TD>
                      <TD>{ws.slug}</TD>
                      <TD className="hidden md:table-cell">
                        {ws.review_enabled ? (
                          <Badge variant="success">Aktif</Badge>
                        ) : (
                          <Badge variant="neutral">Nonaktif</Badge>
                        )}
                      </TD>
                      <TD className="hidden md:table-cell">
                        {new Date(ws.created_at).toLocaleDateString('id-ID')}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => loadBrandProfile(ws)} title="Brand Profile">
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => {
                            setEditingWorkspace(ws)
                            setFormName(ws.name)
                            setFormReviewEnabled(ws.review_enabled)
                            setFormStrategy(ws.strategy || '')
                            setEditOpen(true)
                          }} title="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-danger hover:text-danger" onClick={() => handleDelete(ws.id)} title="Hapus">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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

        {selectedWorkspace && (
          <Card>
            <CardHeader>
              <CardTitle>Workspace Terpilih: {selectedWorkspace.name}</CardTitle>
              <CardDescription>ID: {selectedWorkspace.id}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => loadBrandProfile(selectedWorkspace)}>
                <Settings className="h-4 w-4 mr-2" /> Kelola Brand Profile
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Workspace Baru</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nama Workspace</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Contoh: Bisnis Saya" required />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formReviewEnabled} onChange={(e) => setFormReviewEnabled(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm">Aktifkan review sebelum publish</span>
            </label>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Strategi Konten (opsional)</label>
              <textarea className="h-24 rounded-md border border-input bg-surface px-3 py-2 text-sm" value={formStrategy} onChange={(e) => setFormStrategy(e.target.value)} placeholder="Contoh: Fokus edukasi UMKM, gunakan warna hangat, hindari hard-sell, selalu sertakan CTA..." />
              <p className="text-xs text-muted-foreground">AI akan selalu memperhatikan strategi ini saat generate gambar/video.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
              <Button onClick={handleCreate} disabled={!formName.trim()}>Buat</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workspace</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nama Workspace</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Contoh: Bisnis Saya" required />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formReviewEnabled} onChange={(e) => setFormReviewEnabled(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm">Aktifkan review sebelum publish</span>
            </label>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Strategi Konten (opsional)</label>
              <textarea className="h-24 rounded-md border border-input bg-surface px-3 py-2 text-sm" value={formStrategy} onChange={(e) => setFormStrategy(e.target.value)} placeholder="Contoh: Fokus edukasi UMKM, gunakan warna hangat, hindari hard-sell, selalu sertakan CTA..." />
              <p className="text-xs text-muted-foreground">AI akan selalu memperhatikan strategi ini saat generate gambar/video.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Batal</Button>
              <Button onClick={handleEdit} disabled={!formName.trim()}>Simpan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={brandOpen} onOpenChange={setBrandOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Brand Profile: {selectedWorkspace?.name}</DialogTitle>
          </DialogHeader>
          {brandError && <div className="mb-4 p-3 rounded-md bg-danger/10 text-danger text-sm">{brandError}</div>}
          <form onSubmit={(e) => { e.preventDefault(); handleSaveBrand() }} className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nama Brand</label>
              <Input value={brandForm.name || ''} onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })} placeholder="Nama brand Anda" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Voice Tone</label>
              <Input value={brandForm.voice_tone || ''} onChange={(e) => setBrandForm({ ...brandForm, voice_tone: e.target.value })} placeholder="Contoh: Profesional, Ramah, Otoritatif" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Writing Style</label>
              <Input value={brandForm.writing_style || ''} onChange={(e) => setBrandForm({ ...brandForm, writing_style: e.target.value })} placeholder="Contoh: Storytelling, Edukatif, Promosif" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Target Audience</label>
              <Input value={brandForm.target_audience || ''} onChange={(e) => setBrandForm({ ...brandForm, target_audience: e.target.value })} placeholder="Contoh: UMKM, Pemula, Gen Z" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Key Offers (pisah dengan koma)</label>
              <Input value={(brandForm.key_offers || []).join(', ')} onChange={(e) => setBrandForm({ ...brandForm, key_offers: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Contoh: Konsultasi, Produk Digital, Kursus" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Hashtags (pisah dengan koma)</label>
              <Input value={(brandForm.hashtags || []).join(', ')} onChange={(e) => setBrandForm({ ...brandForm, hashtags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Contoh: #bisnis #marketing #tips" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Dos (Hal yang boleh dilakukan, pisah dengan koma)</label>
              <Input value={(brandForm.dos || []).join(', ')} onChange={(e) => setBrandForm({ ...brandForm, dos: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Contoh: Gunakan bahasa santai, Sertakan CTA" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Don'ts (Hal yang tidak boleh, pisah dengan koma)</label>
              <Input value={(brandForm.donts || []).join(', ')} onChange={(e) => setBrandForm({ ...brandForm, donts: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Contoh: Jangan gunakan jargon berlebihan, Jangan hard-sell" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Example Posts (JSON array: text string)</label>
              <textarea className="h-24 rounded-md border border-input bg-surface px-3 py-2 text-sm font-mono" value={brandExampleText} onChange={(e) => {
                setBrandExampleText(e.target.value)
                try {
                  setBrandForm({ ...brandForm, example_posts: JSON.parse(e.target.value) })
                } catch {}
              }} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setBrandOpen(false)}>Batal</Button>
              <Button type="submit" loading={brandSaving} loadingText="Menyimpan...">Simpan Brand Profile</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}