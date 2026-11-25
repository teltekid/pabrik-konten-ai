import { useEffect, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Hook kosong untuk sumber data dashboard.
 * Ganti isi fetchData dengan sumber nyata (Supabase/API) nanti.
 */
export function useDashboardData<T>() {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true
    async function fetchData() {
      try {
        // TODO: ganti dengan sumber data nyata
        const data = null as T | null
        if (active) setState({ data, loading: false, error: null })
      } catch (e: any) {
        if (active)
          setState({
            data: null,
            loading: false,
            error: e?.message || 'Gagal memuat data',
          })
      }
    }
    fetchData()
    return () => {
      active = false
    }
  }, [])

  return state
}