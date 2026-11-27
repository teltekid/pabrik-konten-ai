import { useState, useEffect } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'

interface HealthRow {
  id: string
  provider: string
  kind: string
  ok: boolean
  latency_ms: number | null
  message: string | null
  checked_at: string
}

export function AiHealthPanel() {
  const [rows, setRows] = useState<HealthRow[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setLoading(true)
      const res = await fetch('/.netlify/functions/ai-health')
      if (!res.ok) throw new Error('Gagal memuat health')
      const j = await res.json()
      setRows(j.latest || [])
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat health')
    } finally {
      setLoading(false)
    }
  }

  async function checkNow() {
    setChecking(true)
    try {
      const res = await fetch('/.netlify/functions/ai-health', { method: 'POST' })
      if (!res.ok) throw new Error('Gagal cek')
      await load()
    } catch (e: any) {
      setError(e?.message || 'Gagal cek')
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Health Model AI
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button variant="soft" size="sm" onClick={checkNow} disabled={checking}>
              {checking ? 'Mengecek...' : 'Cek Sekarang'}
            </Button>
          </div>
        </div>
        <CardDescription>Status terakhir provider teks &amp; gambar</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm text-danger">{error}</div>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada data. Klik "Cek Sekarang".</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={r.ok ? 'success' : 'danger'}>{r.ok ? 'OK' : 'Gagal'}</Badge>
                  <span className="font-medium capitalize">{r.kind}</span>
                  <span className="text-muted-foreground">{r.provider}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {r.latency_ms != null && <span>{r.latency_ms} ms</span>}
                  <span>{new Date(r.checked_at).toLocaleString('id-ID')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}