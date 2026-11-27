import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, RefreshCw } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/dashboard/EmptyState'
import { StatusBadge } from '../components/dashboard/StatusBadge'
import { useWorkspace } from '../features/workspace/context'
import { listAccounts, connectAccount, updateAccount, deleteAccount } from '../features/accounts/api'
import { Account } from '../features/accounts/types'
import { useToast } from '../components/ui/toast'

type Platform = 'instagram' | 'tiktok' | 'youtube' | 'threads'

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'threads', label: 'Threads' },
]

export function AccountsPage() {
  const toast = useToast()
  const { selectedWorkspaceId } = useWorkspace()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [formPlatform, setFormPlatform] = useState<Platform>('instagram')
  const [formLabel, setFormLabel] = useState('')
  const [formHandle, setFormHandle] = useState('')
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)

  const [checking, setChecking] = useState<string | null>(null)

  async function loadData() {
    try {
      setLoading(true)
      const wsId = selectedWorkspaceId
      if (wsId) {
        const accs = await listAccounts(wsId)
        setAccounts(accs)
      } else {
        setAccounts([])
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

  async function handleCreate() {
    if (!selectedWorkspaceId || !formLabel.trim()) return
    try {
      await connectAccount(selectedWorkspaceId, formPlatform, formLabel.trim(), formHandle.trim() || undefined)
      setCreateOpen(false)
      setFormLabel('')
      setFormHandle('')
      setFormPlatform('instagram')
      await loadData()
      toast.success(`Akun "${formLabel.trim()}" berhasil dihubungkan.`)
    } catch (e: any) {
      toast.error(e?.message || 'Gagal membuat akun')
    }
  }

  async function handleEdit() {
    if (!editingAccount) return
    try {
      await updateAccount(editingAccount.id, {
        label: formLabel,
        handle: formHandle,
        status: editingAccount.status,
      })
      setEditOpen(false)
      setEditingAccount(null)
      await loadData()
      toast.success('Akun berhasil diperbarui.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal update akun')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus akun ini?')) return
    try {
      await deleteAccount(id)
      await loadData()
      toast.success('Akun berhasil dihapus.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal hapus akun')
    }
  }

  async function handleRefresh(id: string) {
    setChecking(id)
    try {
      await updateAccount(id, { status: 'connected' })
      await loadData()
      toast.success('Status akun berhasil disegarkan.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal refresh status')
    } finally {
      setChecking(null)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-semibold">Manajemen Akun</h1>
            <p className="text-sm text-muted-foreground">Kelola akun media sosial (Instagram, TikTok, YouTube, Threads)</p>
          </div>
          <Button onClick={() => {
            setCreateOpen(true)
          }}>
            <Plus className="h-4 w-4 mr-2" /> Hubungkan Akun
          </Button>
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Daftar Akun</CardTitle>
            <CardDescription>{accounts.length} akun</CardDescription>
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
            ) : accounts.length === 0 ? (
              <EmptyState title="Belum ada akun" description="Hubungkan akun media sosial pertama Anda." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Platform</TH>
                    <TH>Label</TH>
                    <TH>Handle</TH>
                    <TH>Status</TH>
                    <TH className="hidden md:table-cell">Dibuat</TH>
                    <TH>Aksi</TH>
                  </TR>
                </THead>
                <TBody>
                  {accounts.map((acc) => (
                    <TR key={acc.id}>
                      <TD className="capitalize">{acc.platform}</TD>
                      <TD className="font-medium">{acc.label}</TD>
                      <TD>{acc.handle}</TD>
                      <TD>
                        <StatusBadge status={acc.status} />
                      </TD>
                      <TD className="hidden md:table-cell">{new Date(acc.created_at).toLocaleDateString('id-ID')}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleRefresh(acc.id)} disabled={checking === acc.id} title="Refresh">
                            <RefreshCw className={checking === acc.id ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => {
                            setEditingAccount(acc)
                            setFormLabel(acc.label)
                            setFormHandle(acc.handle || '')
                            setEditOpen(true)
                          }} title="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-danger hover:text-danger" onClick={() => handleDelete(acc.id)} title="Hapus">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hubungkan Akun Media Sosial</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Platform</label>
              <select value={formPlatform} onChange={(e) => setFormPlatform(e.target.value as Platform)} className="h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-soft">
                {PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Label</label>
              <Input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder="Contoh: Instagram Utama" required />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Handle</label>
              <Input value={formHandle} onChange={(e) => setFormHandle(e.target.value)} placeholder="@username" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
              <Button onClick={handleCreate} disabled={!selectedWorkspaceId || !formLabel.trim()}>Hubungkan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Akun</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Label</label>
              <Input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Handle</label>
              <Input value={formHandle} onChange={(e) => setFormHandle(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Batal</Button>
              <Button onClick={handleEdit}>Simpan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}