import { useMemo, useState } from 'react'
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '../ui/card'
import { Table, THead, TBody, TR, TH, TD } from '../ui/table'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { EmptyState } from './EmptyState'
import type { DataTableProps } from '../../types'

export function DataTable<T>({
  columns,
  data,
  loading,
  error,
  pageSize = 8,
  rowKey,
  emptyTitle = 'Belum ada data',
  emptyDescription = 'Data akan tampil di sini.',
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sort) return data
    return [...data].sort((a, b) => {
      const av = (a as any)[sort.key]
      const bv = (b as any)[sort.key]
      if (av === bv) return 0
      const res = av > bv ? 1 : -1
      return sort.dir === 'asc' ? res : -res
    })
  }, [data, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const rows = sorted.slice(page * pageSize, page * pageSize + pageSize)

  function toggleSort(key: string) {
    setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }))
  }

  return (
    <Card className="animate-fade-up overflow-hidden">
      {error ? (
        <div className="p-6 text-sm text-danger">{error}</div>
      ) : loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                {columns.map((c) => (
                  <TH key={String(c.key)} className={c.className}>
                    {c.sortable ? (
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort(String(c.key))}
                      >
                        {c.header}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    ) : (
                      c.header
                    )}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={rowKey(row)}>
                  {columns.map((c) => (
                    <TD key={String(c.key)} className={c.className}>
                      {c.render ? c.render(row) : String((row as any)[c.key] ?? '')}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Halaman {page + 1} dari {pageCount}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}