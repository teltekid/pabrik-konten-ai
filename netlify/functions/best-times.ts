import { Pool } from 'pg'
import { auth } from './auth'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})
async function getSession(req: Request) {
  const s = await (auth as any).api.getSession({ headers: req.headers })
  return s?.user ? s.user : null
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

async function ownsAccount(accountId: string, userId: string): Promise<boolean> {
  const r = await pool.query(
    'SELECT a.id FROM accounts a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=$1 AND w.owner_id=$2',
    [accountId, userId],
  )
  return r.rowCount > 0
}

// Saran jam posting terbaik Instagram 2026 (data Buffer/Sprout/Hootsuite 2026).
// day_of_week: 0=Minggu ... 6=Sabtu (mengikuti Date.getDay()).
function suggestions(): { day_of_week: number; time_slot: string; score: number }[] {
  const byDay: Record<number, { time_slot: string; score: number }[]> = {
    0: [
      { time_slot: '21:00', score: 96 },
      { time_slot: '22:00', score: 94 },
      { time_slot: '20:00', score: 90 },
    ],
    1: [
      { time_slot: '19:00', score: 90 },
      { time_slot: '18:00', score: 88 },
      { time_slot: '20:00', score: 86 },
    ],
    2: [
      { time_slot: '19:00', score: 92 },
      { time_slot: '15:00', score: 88 },
      { time_slot: '17:00', score: 86 },
    ],
    3: [
      { time_slot: '12:00', score: 98 },
      { time_slot: '18:00', score: 96 },
      { time_slot: '20:00', score: 90 },
    ],
    4: [
      { time_slot: '09:00', score: 99 },
      { time_slot: '08:00', score: 94 },
      { time_slot: '07:00', score: 90 },
    ],
    5: [
      { time_slot: '22:00', score: 84 },
      { time_slot: '21:00', score: 82 },
      { time_slot: '06:00', score: 78 },
    ],
    6: [
      { time_slot: '21:00', score: 88 },
      { time_slot: '22:00', score: 86 },
      { time_slot: '20:00', score: 84 },
    ],
  }
  return Object.entries(byDay).flatMap(([d, arr]) =>
    arr.map((s) => ({ day_of_week: Number(d), ...s })),
  )
}

export default async (req: Request): Promise<Response> => {
  try {
    const user = await getSession(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const url = new URL(req.url)

    if (req.method === 'GET') {
      const account = url.searchParams.get('account_id')
      if (!account) return json({ error: 'account_id required' }, 400)
      if (!(await ownsAccount(account, user.id))) return json({ error: 'Not found' }, 404)
      const { rows } = await pool.query('SELECT * FROM best_times WHERE account_id=$1 ORDER BY day_of_week, score DESC', [account])
      return json(rows)
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const account = body?.account_id
      if (!account) return json({ error: 'account_id required' }, 400)
      if (!(await ownsAccount(account, user.id))) return json({ error: 'Not found' }, 404)
      const sugg = suggestions()
      for (const s of sugg) {
        await pool.query(
          `INSERT INTO best_times (account_id, day_of_week, time_slot, score, source)
           VALUES ($1,$2,$3,$4,'suggestion')
           ON CONFLICT (account_id, day_of_week, time_slot) DO UPDATE SET score=EXCLUDED.score, source=EXCLUDED.source`,
          [account, s.day_of_week, s.time_slot, s.score],
        )
      }
      const { rows } = await pool.query('SELECT * FROM best_times WHERE account_id=$1 ORDER BY day_of_week, score DESC', [account])
      return json({ ok: true, count: rows.length, best_times: rows })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    console.error('[best-times] error:', e)
    return json({ error: e?.message || String(e) }, 500)
  }
}