import { readFileSync } from 'node:fs'
import pg from 'pg'

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Za-z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})
const billyId = 'GEBAzz2lRBWSQPl6ViHH0A6qIuP8AJeS'
try {
  const tf = await pool.query('SELECT verified, "failedVerificationCount", "lockedUntil", "backupCodes" FROM "twoFactor" WHERE "userId"=$1', [billyId])
  if (tf.rows[0]) {
    const t = tf.rows[0]
    console.log('2FA verified:', t.verified)
    console.log('failedVerificationCount:', t.failedVerificationCount)
    console.log('lockedUntil:', t.lockedUntil)
    let bc = t.backupCodes
    if (typeof bc === 'string') { try { bc = JSON.parse(bc) } catch {} }
    console.log('backupCodes count:', Array.isArray(bc) ? bc.length : bc)
  } else {
    console.log('No 2FA row for billy')
  }
  const now = new Date()
  console.log('now:', now.toISOString())
} catch (e) {
  console.error('ERR:', e.message)
} finally {
  await pool.end()
}