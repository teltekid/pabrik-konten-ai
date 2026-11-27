import { betterAuth } from 'better-auth'
import { twoFactor } from 'better-auth/plugins'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:8888',
  basePath: '/.netlify/functions/auth',
  secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-me',
  database: pool,
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  plugins: [twoFactor()],
})

export default async (req: Request): Promise<Response> => {
  try {
    return await auth.handler(req)
  } catch (e: any) {
    console.error('[auth] error:', e)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}