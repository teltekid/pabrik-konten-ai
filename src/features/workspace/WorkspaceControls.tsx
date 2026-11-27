import { useState } from 'react'
import { Plus, Pencil, Trash2, Settings } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { useToast } from '../../components/ui/toast'
import { useWorkspace } from './context'
import { createWorkspace, updateWorkspace, deleteWorkspace, getBrandProfile, saveBrandProfile } from './api'
import { BrandProfile } from './types'

export function WorkspaceControls() {
  const toast = useToast()
  const { selectedWorkspaceId, selectedWorkspace, setSelectedWorkspaceId, refresh } = useWorkspace()

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [brandOpen, setBrandOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formName, setFormName] = useState('')
  const [formReview, setFormReview] = useState(false)
  const [formStrategy, setFormStrategy] = useState('')

  const [brandForm, setBrandForm] = useState<Partial<BrandProfile>>({})
  const [brandExampleText, setBrandExampleText] = useState('[]')
  const [brandError, setBrandError] = useState<string | null>(null)

  const hasWorkspace = Boolean(selectedWorkspaceId)

  async function handleCreate() {
    if (!formName.trim()) return
    setSaving(true)
    try {
      const ws = await createWorkspace(formName.trim())
      await refresh()
      setSelectedWorkspaceId(ws.id)
      setCreateOpen(false)
      setFormName('')
      setFormReview(false)
      setFormStrategy('')
      toast.success(`Workspace "${formName.trim()}" dibuat.`)
    } catch (e: any) {
      toast.error(e?.message || 'Gagal membuat workspace')
    } finally {
      setSaving(false)
    }
  }

  function openEdit() {
    if (!selectedWorkspace) return
    setFormName(selectedWorkspace.name)
    setFormReview(selectedWorkspace.review_enabled)
    setFormStrategy(selectedWorkspace.strategy || '')
    setEditOpen(true)
  }

  async function handleEdit() {
    if (!selectedWorkspace || !formName.trim()) return
    setSaving(true)
    try {
      await updateWorkspace(selectedWorkspace.id, {
        name: formName.trim(),
        review_enabled: formReview,
        strategy: formStrategy.trim() || null,
      })
      await refresh()
      setEditOpen(false)
      toast.success('Workspace diperbarui.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal update workspace')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedWorkspace) return
    if (!confirm(`Hapus workspace "${selectedWorkspace.name}"? Tindakan tidak bisa dibatalkan.`)) return
    setSaving(true)
    try {
      await deleteWorkspace(selectedWorkspace.id)
      await refresh()
      toast.success('Workspace dihapus.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal hapus workspace')
    } finally {
      setSaving(false)
    }
  }

  async function openBrand() {
    if (!selectedWorkspace) return
    setBrandError(null)
    try {
      const profile = await getBrandProfile(selectedWorkspace.id)
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

  async function handleSaveBrand() {
    if (!selectedWorkspace) return
    setSaving(true)
    setBrandError(null)
    try {
      await saveBrandProfile(selectedWorkspace.id, brandForm)
      setBrandOpen(false)
      toast.success('Brand profile disimpan.')
    } catch (e: any) {
      const msg = e?.message || 'Gagal menyimpan brand profile'
      setBrandError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const iconBtn = 'h-8 w-8'

  return (
    <>
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 shadow-soft">
        <Button variant="ghost" size="icon" className={iconBtn} title="Buat Workspace" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className={iconBtn} title="Edit Workspace" disabled={!hasWorkspace} onClick={openEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className={`${iconBtn} text-danger hover:text-danger`} title="Hapus Workspace" disabled={!hasWorkspace} onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className={iconBtn} title="Setting Workspace" disabled={!hasWorkspace} onClick={openBrand}>
          <Settings className="h-4 w-4" />
        </Button>
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
              <input type="checkbox" checked={formReview} onChange={(e) => setFormReview(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm">Aktifkan review sebelum publish</span>
            </label>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Strategi Konten (opsional)</label>
              <textarea className="h-24 rounded-md border border-input bg-surface px-3 py-2 text-sm" value={formStrategy} onChange={(e) => setFormStrategy(e.target.value)} placeholder="Contoh: Fokus edukasi UMKM, gunakan warna hangat, hindari hard-sell, selalu sertakan CTA..." />
              <p className="text-xs text-muted-foreground">AI akan selalu memperhatikan strategi ini saat generate gambar/video.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
              <Button loading={saving} loadingText="Menyimpan..." onClick={handleCreate} disabled={!formName.trim()}>Buat</Button>
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
              <input type="checkbox" checked={formReview} onChange={(e) => setFormReview(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm">Aktifkan review sebelum publish</span>
            </label>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Strategi Konten (opsional)</label>
              <textarea className="h-24 rounded-md border border-input bg-surface px-3 py-2 text-sm" value={formStrategy} onChange={(e) => setFormStrategy(e.target.value)} placeholder="Contoh: Fokus edukasi UMKM, gunakan warna hangat, hindari hard-sell, selalu sertakan CTA..." />
              <p className="text-xs text-muted-foreground">AI akan selalu memperhatikan strategi ini saat generate gambar/video.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Batal</Button>
              <Button loading={saving} loadingText="Menyimpan..." onClick={handleEdit} disabled={!formName.trim()}>Simpan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={brandOpen} onOpenChange={setBrandOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Setting Workspace: {selectedWorkspace?.name}</DialogTitle>
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
              <label className="text-sm font-medium">Dos (pisah dengan koma)</label>
              <Input value={(brandForm.dos || []).join(', ')} onChange={(e) => setBrandForm({ ...brandForm, dos: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Contoh: Gunakan bahasa santai, Sertakan CTA" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Don'ts (pisah dengan koma)</label>
              <Input value={(brandForm.donts || []).join(', ')} onChange={(e) => setBrandForm({ ...brandForm, donts: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Contoh: Jangan gunakan jargon berlebihan, Jangan hard-sell" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Example Posts (JSON array)</label>
              <textarea className="h-24 rounded-md border border-input bg-surface px-3 py-2 text-sm font-mono" value={brandExampleText} onChange={(e) => {
                setBrandExampleText(e.target.value)
                try {
                  setBrandForm({ ...brandForm, example_posts: JSON.parse(e.target.value) })
                } catch {}
              }} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setBrandOpen(false)}>Batal</Button>
              <Button type="submit" loading={saving} loadingText="Menyimpan...">Simpan Setting</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}