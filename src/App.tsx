import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from './lib/supabase'
import { authClient } from './lib/auth'

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
  const [twoFactor, setTwoFactor] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [raw, setRaw] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setRaw('')
    try {
      if (mode === 'signup') {
        const res = await authClient.signUp.email({ email, password, name })
        setRaw(JSON.stringify(res))
        if (res.error) throw res.error
      } else {
        const res = await authClient.signIn.email({ email, password })
        setRaw(JSON.stringify(res))
        const needs2fa =
          (res.data as any)?.twoFactorRedirect === true ||
          /two.?factor|2fa|totp/i.test(String(res.error?.message || ''))
        if (res.error && !needs2fa) throw res.error
        if (needs2fa) {
          setTwoFactor(true)
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
    } catch (e: any) {
      setError(e?.message || 'Kode TOTP salah')
    } finally {
      setBusy(false)
    }
  }

  if (twoFactor) {
    return (
      <div style={card}>
        <h2>Verifikasi 2FA</h2>
        <form onSubmit={verify} style={{ display: 'grid', gap: 12 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode TOTP (6 digit)" style={input} />
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button disabled={busy} style={btn}>{busy ? 'Memverifikasi...' : 'Verifikasi'}</button>
        </form>
      </div>
    )
  }

  return (
    <div style={card}>
      <h2>{mode === 'signin' ? 'Masuk' : 'Daftar'}</h2>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        {mode === 'signup' && (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" style={input} required />
        )}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={input} required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={input} required />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button disabled={busy} style={btn}>{busy ? 'Memproses...' : mode === 'signin' ? 'Masuk' : 'Daftar'}</button>
        {raw && <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', maxWidth: 320 }}>{raw}</pre>}
      </form>
      <p style={{ fontSize: 13, marginTop: 12 }}>
        {mode === 'signin' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'signin' ? 'signup' : 'signin') }}>
          {mode === 'signin' ? 'Daftar' : 'Masuk'}
        </a>
      </p>
    </div>
  )
}

const card: React.CSSProperties = { maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui', padding: 24, border: '1px solid #eee', borderRadius: 12 }
const input: React.CSSProperties = { padding: 8, width: '100%' }
const btn: React.CSSProperties = { padding: '10px 20px', cursor: 'pointer' }

function TwoFactorSetup() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [raw, setRaw] = useState('')

  async function enable(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setRaw('')
    try {
      const res = await authClient.twoFactor.enable({ password })
      setRaw(JSON.stringify(res))
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
    return <button style={{ ...btn, marginBottom: 8 }} onClick={() => setOpen(true)}>Aktifkan 2FA/TOTP</button>
  }

  return (
    <div style={{ ...card, maxWidth: 420, margin: '16px auto' }}>
      <h3>Aktifkan 2FA</h3>
      {!secret ? (
        <form onSubmit={enable} style={{ display: 'grid', gap: 10 }}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={input} required />
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button disabled={busy} style={btn}>{busy ? '...' : 'Buat secret'}</button>
          {raw && <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', maxWidth: 360 }}>{raw}</pre>}
        </form>
      ) : (
        <form onSubmit={verify} style={{ display: 'grid', gap: 10 }}>
          {qr && <img src={qr} alt="QR" style={{ width: 160 }} />}
          <code style={{ fontSize: 12 }}>{secret}</code>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode TOTP" style={input} required />
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button disabled={busy} style={btn}>{busy ? '...' : 'Verifikasi & Aktifkan'}</button>
        </form>
      )}
    </div>
  )
}

export default function App() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return <div style={{ textAlign: 'center', marginTop: 80, fontFamily: 'system-ui' }}>Memuat...</div>
  }

  if (!session) {
    return (
      <div>
        <h1 style={{ textAlign: 'center', fontFamily: 'system-ui' }}>🏭 PABRIK KONTEN AI</h1>
        <AuthForm />
      </div>
    )
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