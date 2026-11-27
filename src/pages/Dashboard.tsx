import { useState, lazy, Suspense } from 'react'
import { LayoutDashboard, Film, BarChart3, Settings, AtSign, FileText, CalendarClock, CalendarDays, Send } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import { SkeletonLoader } from '../components/dashboard/SkeletonLoader'
import { EmptyState } from '../components/dashboard/EmptyState'
import { useDashboardData } from '../data'
import { Dashboard as VideoDashboard } from '../App'
import { AccountsPage } from './Accounts'
import { PostsPage } from './Posts'
import { SchedulesPage } from './Schedules'
import { PublishPage } from './Publish'
import { AiHealthPanel } from '../components/dashboard/AiHealthPanel'

const CalendarPage = lazy(() => import('./Calendar').then((m) => ({ default: m.CalendarPage })))

export function DashboardPage() {
  const [tab, setTab] = useState('ringkasan')
  const { data, loading, error } = useDashboardData<unknown>()

  const nav: any[] = [
    { label: 'Ringkasan', href: '#ringkasan', icon: <LayoutDashboard className="h-4 w-4" />, id: 'ringkasan', active: tab === 'ringkasan', onClick: () => setTab('ringkasan') },
    { label: 'Video', href: '#video', icon: <Film className="h-4 w-4" />, id: 'video', active: tab === 'video', onClick: () => setTab('video') },
    { label: 'Akun', href: '#akun', icon: <AtSign className="h-4 w-4" />, id: 'akun', active: tab === 'akun', onClick: () => setTab('akun') },
    { label: 'Post', href: '#post', icon: <FileText className="h-4 w-4" />, id: 'post', active: tab === 'post', onClick: () => setTab('post') },
    { label: 'Kalender', href: '#kalender', icon: <CalendarDays className="h-4 w-4" />, id: 'kalender', active: tab === 'kalender', onClick: () => setTab('kalender') },
    { label: 'Jadwal', href: '#jadwal', icon: <CalendarClock className="h-4 w-4" />, id: 'jadwal', active: tab === 'jadwal', onClick: () => setTab('jadwal') },
    { label: 'Publish', href: '#publish', icon: <Send className="h-4 w-4" />, id: 'publish', active: tab === 'publish', onClick: () => setTab('publish') },
    { label: 'Analitik', href: '#analitik', icon: <BarChart3 className="h-4 w-4" />, id: 'analitik', active: tab === 'analitik', onClick: () => setTab('analitik') },
    { label: 'Pengaturan', href: '#pengaturan', icon: <Settings className="h-4 w-4" />, id: 'pengaturan', active: tab === 'pengaturan', onClick: () => setTab('pengaturan') },
  ]

  const titles: Record<string, string> = {
    ringkasan: 'Ringkasan',
    video: 'Video',
    workspace: 'Workspace',
    akun: 'Akun Sosial',
    post: 'Post & Konten',
    kalender: 'Kalender Konten',
    jadwal: 'Jadwal Publishing',
    publish: 'Publish & Scheduling',
    analitik: 'Analitik',
    pengaturan: 'Pengaturan',
  }

  return (
    <AppLayout title={titles[tab] || 'Ringkasan'} nav={nav}>
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Memuat halaman...</div>}>
      {tab === 'ringkasan' ? (
        <>
          <div className="space-y-6">
            <AiHealthPanel />
            {loading ? <SkeletonLoader /> : error ? (
              <div className="rounded-lg border border-danger/20 bg-danger/10 p-6 text-sm text-danger">{error}</div>
            ) : !data ? (
              <EmptyState title="Belum ada data" description="Sumber data belum diisi." />
            ) : null}
          </div>
        </>
      ) : tab === 'video' ? (
        <VideoDashboard />
      ) : tab === 'akun' ? (
        <AccountsPage />
      ) : tab === 'post' ? (
        <PostsPage />
      ) : tab === 'kalender' ? (
        <CalendarPage />
      ) : tab === 'jadwal' ? (
        <SchedulesPage />
      ) : tab === 'publish' ? (
        <PublishPage />
      ) : tab === 'analitik' ? (
        <div className="text-sm text-muted-foreground">Halaman Analitik (belum implemented)</div>
      ) : tab === 'pengaturan' ? (
        <div className="text-sm text-muted-foreground">Halaman Pengaturan (belum implemented)</div>
      ) : null}
      </Suspense>
    </AppLayout>
  )
}