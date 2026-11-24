import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

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

export default function App() {
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

  async function loadJobs() {
    const { data } = await supabase
      .from('video_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setJobs(data as VideoJob[])
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