import { LayoutDashboard, Film, BarChart3, Settings } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import { SkeletonLoader } from '../components/dashboard/SkeletonLoader'
import { EmptyState } from '../components/dashboard/EmptyState'
import { useDashboardData } from '../data'

const nav = [
  { label: 'Ringkasan', href: '#', icon: <LayoutDashboard className="h-4 w-4" />, active: true },
  { label: 'Video', href: '#', icon: <Film className="h-4 w-4" /> },
  { label: 'Analitik', href: '#', icon: <BarChart3 className="h-4 w-4" /> },
  { label: 'Pengaturan', href: '#', icon: <Settings className="h-4 w-4" /> },
]

export function DashboardPage() {
  const { data, loading, error } = useDashboardData<unknown>()

  return (
    <AppLayout title="Ringkasan" nav={nav}>
      {loading ? (
        <SkeletonLoader />
      ) : error ? (
        <div className="rounded-lg border border-danger/20 bg-danger/10 p-6 text-sm text-danger">{error}</div>
      ) : !data ? (
        <EmptyState
          title="Belum ada data"
          description="Sumber data belum diisi. Hubungkan hook useDashboardData untuk menampilkan statistik."
        />
      ) : null}
    </AppLayout>
  )
}