import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from './lib/supabase'
import { authClient } from './lib/auth'
import { Card } from './components/ui/card'
import { Input } from './components/ui/input'
import { Button } from './components/ui/button'

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface VideoJob {
  id: string
  topic: string
  status: JobStatus
  output_links: Record<string, string>
  error_message: string | null
  created_at: string
}

const DESTINATIONS = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'gdrive', label: 'Google Drive' },
  { key: 'youtube', label: 'YouTube (stub)' },
]

function Dashboard() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const [topic, setTopic] = useState('')
  const [language, setLanguage] = useState('id-ID')
  const [voice, setVoice] = useState('id-ID-ArdiNeural')
  const [destinations, setDestinations] = useState<Record<string, boolean>>({
    telegram: true,
    gdrive: false,
    youtube: false,
  })
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!supabaseUrl || !supabaseAnon) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui', padding: '0 16px' }}>
        <h1>🏭 PABRIK KONTEN AI</h1>
        <p style={{ color: 'red' }}>
          Konfigurasi Supabase belum diset. Set <code>VITE_SUPABASE_URL</code> dan{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> di Netlify (Environment variables) lalu redeploy.
        </p>
      </div>
    )
  }

  async function loadJobs() {
    try {
      const { data, error: err } = await supabase
        .from('video_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (err) throw err
      if (data) setJobs(data as VideoJob[])
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat job')
    }
  }

  useEffect(() => {
    loadJobs()
    const interval = setInterval(loadJobs, 5000)
    return () => clearInterval(interval)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/.netlify/functions/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, language, voice_name: voice, destinations }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal trigger job')
      setTopic('')
      await loadJobs()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui', padding: '0 16px' }}>
      <h1>🏭 PABRIK KONTEN AI</h1>
      <p style={{ color: '#666' }}>Generate video pendek otomatis (TikTok/Reels/Shorts)</p>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
        <label>
          Topik / Judul:{'\n'}
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Contoh: 5 fakta unik tentang laut"
            required
            style={{ width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>
        <label>
          Bahasa:{'\n'}
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ padding: 8 }}>
            <option value="id-ID">Bahasa Indonesia</option>
            <option value="en-US">English</option>
          </select>
        </label>
        <label>
          Voice:{'\n'}
          <input value={voice} onChange={(e) => setVoice(e.target.value)} style={{ width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <fieldset style={{ border: '1px solid #ccc', padding: 12 }}>
          <legend>Destinasi Output</legend>
          {DESTINATIONS.map((d) => (
            <label key={d.key} style={{ marginRight: 16 }}>
              <input
                type="checkbox"
                checked={!!destinations[d.key]}
                onChange={(e) => setDestinations({ ...destinations, [d.key]: e.target.checked })}
              />{' '}
              {d.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={loading} style={{ padding: '10px 20px', cursor: 'pointer' }}>
          {loading ? 'Memproses...' : '🚀 Generate Video'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>

      <h2>Status Job</h2>
      {jobs.length === 0 && <p style={{ color: '#666' }}>Belum ada job.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {jobs.map((job) => (
          <li key={job.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <strong>{job.topic}</strong>
            <span style={{ float: 'right', padding: '2px 8px', borderRadius: 4, background: statusColor(job.status), color: '#fff', fontSize: 12 }}>
              {job.status}
            </span>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              {new Date(job.created_at).toLocaleString('id-ID')}
            </div>
            {job.error_message && <div style={{ color: 'red', fontSize: 12 }}>{job.error_message}</div>}
            {Object.keys(job.output_links || {}).length > 0 && (
              <div style={{ marginTop: 8 }}>
                {Object.entries(job.output_links).map(([k, v]) => (
                  <a key={k} href={v} target="_blank" rel="noreferrer" style={{ marginRight: 12, fontSize: 12 }}>
                    {k}
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function statusColor(s: JobStatus): string {
  switch (s) {
    case 'pending': return '#999'
    case 'processing': return '#2196f3'
    case 'completed': return '#4caf50'
    case 'failed': return '#f44336'
  }
}

function AuthForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [twoFactor, setTwoFactor] = useState(() => sessionStorage.getItem('awaiting2fa') === '1')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  function begin2fa() {
    sessionStorage.setItem('awaiting2fa', '1')
    setTwoFactor(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signup') {
        const res = await authClient.signUp.email({ email, password, name })
        if (res.error) throw res.error
      } else {
        const res = await authClient.signIn.email({ email, password })
        if (res.error) {
          const needs2fa = /two.?factor|2fa|totp/i.test(String(res.error.message || ''))
          if (!needs2fa) throw res.error
          begin2fa()
          return
        }
        // Jika tidak ada session setelah sign-in -> butuh 2FA
        const sess = await authClient.getSession()
        if (!sess.data) {
          begin2fa()
          return
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Gagal')
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await authClient.twoFactor.verifyTotp({ code })
      if (res.error) throw res.error
      sessionStorage.removeItem('awaiting2fa')
      setTwoFactor(false)
    } catch (e: any) {
      setError(e?.message || 'Kode TOTP salah')
    } finally {
      setBusy(false)
    }
  }

  if (twoFactor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm p-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 font-serif text-lg font-semibold text-accent">
            PA
          </div>
          <h2 className="font-serif text-xl font-semibold">Verifikasi 2FA</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Masukkan kode dari aplikasi authenticator.</p>
          <form onSubmit={verify} className="grid gap-3">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Kode TOTP (6 digit)"
              className="tabular text-center tracking-widest"
              required
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button disabled={busy} className="w-full">
              {busy ? 'Memverifikasi...' : 'Verifikasi'}
            </Button>
          </form>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 font-serif text-lg font-semibold text-accent">
          PA
        </div>
        <h2 className="font-serif text-xl font-semibold">
          {mode === 'signin' ? 'Selamat datang' : 'Buat akun'}
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          {mode === 'signin' ? 'Masuk untuk melanjutkan.' : 'Daftar untuk mulai.'}
        </p>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                'rounded-sm px-3 py-1.5 text-sm transition-colors ' +
                (mode === m ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground')
              }
            >
              {m === 'signin' ? 'Masuk' : 'Daftar'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="grid gap-3">
          {mode === 'signup' && (
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" required />
          )}
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button disabled={busy} className="w-full">
            {busy ? 'Memproses...' : mode === 'signin' ? 'Masuk' : 'Daftar'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

function TwoFactorSetup() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function enable(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await authClient.twoFactor.enable({ password })
      if (res.error) throw res.error
      const data = res.data as any
      const uri = data?.totpURI || data?.qrCode || null
      setSecret(uri)
      if (uri && !uri.startsWith('data:image')) {
        const dataUrl = await QRCode.toDataURL(uri)
        setQr(dataUrl)
      } else {
        setQr(uri)
      }
    } catch (e: any) { setError(e?.message || 'Gagal enable') }
    finally { setBusy(false) }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await authClient.twoFactor.verifyTotp({ code })
      if (res.error) throw res.error
      setOpen(false); setSecret(null); setQr(null)
    } catch (e: any) { setError(e?.message || 'Kode salah') }
    finally { setBusy(false) }
  }

  if (!open) {
    return (
      <div className="mx-auto mb-2 max-w-sm">
        <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
          Aktifkan 2FA/TOTP
        </Button>
      </div>
    )
  }

  return (
    <Card className="mx-auto mb-2 max-w-sm p-4">
      <h3 className="mb-3 font-serif text-base font-semibold">Aktifkan 2FA</h3>
      {!secret ? (
        <form onSubmit={enable} className="grid gap-2">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button disabled={busy} className="w-full">
            {busy ? '...' : 'Buat secret'}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="grid gap-2">
          {qr && <img src={qr} alt="QR" className="mx-auto h-40 w-40" />}
          <code className="tabular break-all text-xs text-muted-foreground">{secret}</code>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode TOTP" className="tabular" required />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button disabled={busy} className="w-full">
            {busy ? '...' : 'Verifikasi & Aktifkan'}
          </Button>
        </form>
      )}
    </Card>
  )
}

export default function App() {
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (session) {
      window.location.replace('/dashboard.html')
    }
  }, [session])

  if (isPending) {
    return <div style={{ textAlign: 'center', marginTop: 80, fontFamily: 'system-ui' }}>Memuat...</div>
  }

  if (!session) {
    return <AuthForm />
  }

  return (
    <div>
      <div style={{ textAlign: 'right', padding: 8, fontFamily: 'system-ui' }}>
        {session.user.email} ·{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); authClient.signOut() }}>Keluar</a>
      </div>
      <TwoFactorSetup />
      <Dashboard />
    </div>
  )
}