import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/dashboard/EmptyState'
import { useWorkspace } from '../features/workspace/context'
import { listAccounts } from '../features/accounts/api'
import { listSchedules, addSchedule, removeSchedule } from '../features/schedules/api'
import { Schedule } from '../features/schedules/types'
import { listBestTimes, generateBestTimes } from '../features/besttimes/api'
import { BestTime } from '../features/besttimes/types'
import { useToast } from '../components/ui/toast'

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

export function SchedulesPage() {
  const toast = useToast()
  const { selectedWorkspaceId } = useWorkspace()
  const [accounts, setAccounts] = useState<any[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [bestTimes, setBestTimes] = useState<BestTime[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [formAccountId, setFormAccountId] = useState('')
  const [formDayOfWeek, setFormDayOfWeek] = useState(1)
  const [formTimeSlot, setFormTimeSlot] = useState('09:00')

  async function loadData() {
    try {
      setLoading(true)
      const wsId = selectedWorkspaceId
      if (wsId) {
        const accs = await listAccounts(wsId)
        setAccounts(accs)
        const accId = formAccountId && accs.some((a) => a.id === formAccountId) ? formAccountId : accs[0]?.id || ''
        setFormAccountId(accId)
        if (accId) {
          const scheds = await listSchedules(accId)
          setSchedules(scheds)
        } else {
          setSchedules([])
        }
      } else {
        setAccounts([])
        setSchedules([])
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

  useEffect(() => {
    if (formAccountId) listBestTimes(formAccountId).then(setBestTimes).catch(() => setBestTimes([]))
  }, [formAccountId])

  async function handleGenerateBest() {
    if (!formAccountId) return
    try {
      const r = await generateBestTimes(formAccountId)
      setBestTimes(r.best_times)
      toast.success('Saran jam posting terbaik berhasil dibuat.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal membuat saran jam')
    }
  }

  async function handleAdd() {
    if (!formAccountId) return
    try {
      await addSchedule(formAccountId, formDayOfWeek, formTimeSlot)
      setAddOpen(false)
      setFormDayOfWeek(1)
      setFormTimeSlot('09:00')
      const scheds = await listSchedules(formAccountId)
      setSchedules(scheds)
      toast.success('Slot jadwal berhasil ditambahkan.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menambah jadwal')
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Hapus jadwal ini?')) return
    try {
      await removeSchedule(id)
      if (formAccountId) {
        const scheds = await listSchedules(formAccountId)
        setSchedules(scheds)
      }
      toast.success('Jadwal berhasil dihapus.')
    } catch (e: any) {
      toast.error(e?.message || 'Gagal hapus jadwal')
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-semibold">Manajemen Jadwal</h1>
            <p className="text-sm text-muted-foreground">Atur waktu posting otomatis per akun media sosial</p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Tambah Slot Jadwal
          </Button>
        </div>

        {accounts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pilih Akun</CardTitle>
              <CardDescription>Jadwal posting untuk akun yang dipilih</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                value={formAccountId}
                onChange={(e) => {
                  setFormAccountId(e.target.value)
                  if (e.target.value) {
                    listSchedules(e.target.value).then(setSchedules)
                  }
                }}
                className="h-9 w-full max-w-sm rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-soft"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.label} (@{acc.handle})</option>
                ))}
              </select>
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Daftar Jadwal</CardTitle>
            <CardDescription>{schedules.length} slot jadwal</CardDescription>
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
            ) : schedules.length === 0 ? (
              <EmptyState title="Belum ada jadwal" description="Tambah slot jadwal untuk memulai posting otomatis." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Akun</TH>
                    <TH className="hidden sm:table-cell">Hari</TH>
                    <TH className="hidden md:table-cell">Waktu</TH>
                    <TH>Aksi</TH>
                  </TR>
                </THead>
                <TBody>
                  {schedules.map((s) => {
                    const acc = accounts.find((a: any) => a.id === s.account_id)
                    return (
                      <TR key={s.id}>
                        <TD>{acc?.label || s.account_id}</TD>
                        <TD className="hidden sm:table-cell">{DAYS[s.day_of_week]}</TD>
                        <TD className="hidden md:table-cell">{s.time_slot}</TD>
                        <TD>
                          <Button variant="ghost" size="icon" className="text-danger hover:text-danger" onClick={() => handleRemove(s.id)} title="Hapus">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saran Jam Posting Terbaik</CardTitle>
            <CardDescription>Rekomendasi jam harian untuk akun terpilih</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="soft" onClick={handleGenerateBest} disabled={!formAccountId}>Buat Saran</Button>
            {bestTimes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada saran. Klik "Buat Saran".</p>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((day, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 text-xs">
                    <span className="font-medium">{day}</span>
                    {bestTimes.filter((b) => b.day_of_week === i).map((b) => (
                      <Badge key={b.id} variant="accent" className="w-20 justify-center">{b.time_slot}</Badge>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-7 gap-1 mt-8">
          {DAYS.map((day, i) => (
            <div key={i} className="flex flex-col items-center gap-1 text-xs">
              <span className="font-medium">{day}</span>
              {schedules
                .filter((s) => s.day_of_week === i)
                .map((s) => (
                  <Badge key={s.id} variant="accent" className="w-20">
                    {s.time_slot}
                  </Badge>
                ))}
            </div>
          ))}
        </div>
      </div>

      <div className="fixed inset-0 z-50 bg-foreground/20" />
      {addOpen && (
        <div className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-surface p-6 shadow-soft">
          <div className="flex flex-col gap-1 text-left">
            <h3 className="font-serif text-lg font-semibold">Tambah Slot Jadwal</h3>
            <p className="text-sm text-muted-foreground">Atur waktu posting otomatis untuk akun</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleAdd() }} className="grid gap-3 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Akun</label>
              <select value={formAccountId} onChange={(e) => setFormAccountId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-soft">
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.label} (@{acc.handle})</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Hari</label>
              <select value={formDayOfWeek} onChange={(e) => setFormDayOfWeek(Number(e.target.value))} className="h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-soft">
                {DAYS.map((day, i) => (
                  <option key={i} value={i}>{day}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Waktu</label>
              <input type="time" value={formTimeSlot} onChange={(e) => setFormTimeSlot(e.target.value)} className="h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-soft" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}