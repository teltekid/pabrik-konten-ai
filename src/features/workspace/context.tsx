import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { Workspace } from './types'
import { listWorkspaces } from './api'

interface WorkspaceContextValue {
  workspaces: Workspace[]
  selectedWorkspaceId: string
  selectedWorkspace: Workspace | null
  setSelectedWorkspaceId: (id: string) => void
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined)
const LS_KEY = 'pa.selectedWorkspace'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspaceId, setSelected] = useState<string>(() => localStorage.getItem(LS_KEY) || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const ws = await listWorkspaces()
      setWorkspaces(ws)
      setSelected((prev) => (prev && ws.some((w) => w.id === prev) ? prev : ws[0]?.id || ''))
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat workspace')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const setSelectedWorkspaceId = useCallback((id: string) => {
    setSelected(id)
    localStorage.setItem(LS_KEY, id)
  }, [])

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) || null

  return (
    <WorkspaceContext.Provider
      value={{ workspaces, selectedWorkspaceId, selectedWorkspace, setSelectedWorkspaceId, loading, error, refresh }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace harus dipakai di dalam WorkspaceProvider')
  return ctx
}