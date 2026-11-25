import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? `${window.location.origin}/.netlify/functions/auth`
      : 'http://localhost:8888/.netlify/functions/auth',
  plugins: [twoFactorClient()],
})