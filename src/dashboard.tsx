import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { DashboardPage } from './pages/Dashboard'
import { authClient } from './lib/auth'

function Guard() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return <div style={{ textAlign: 'center', marginTop: 80, fontFamily: 'system-ui' }}>Memuat...</div>
  }

  if (!session) {
    window.location.replace('/')
    return null
  }

  return <DashboardPage />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Guard />
  </React.StrictMode>,
)