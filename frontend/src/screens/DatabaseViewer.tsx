import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { DbTablePage } from '../types'
import { useDebounced } from '../hooks/useDebounced'
import { IconSearch } from '../components/Icons'

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

export default function DatabaseViewer() {
  const [tables, setTables] = useState<string[]>([])
  const [table, setTable] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [data, setData] = useState<DbTablePage | null>(null)

  useEffect(() => {
    api.listTables().then((ts) => {
      setTables(ts)
      if (ts.length > 0) setTable(ts[0])
    })
  }, [])

  useEffect(() => {
    setPage(1)
  }, [table, debouncedSearch])

  useEffect(() => {
    if (!table) return
    api.getTable(table, { page, search: debouncedSearch || undefined }).then(setData)
  }, [table, page, debouncedSearch])

  const columns = data && data.rows.length > 0 ? Object.keys(data.rows[0]) : []

  return (
    <div className="flex-1 h-full w-full flex flex-col p-6 overflow-hidden">
      <div className="flex justify-between items-center mb-6 shrink-0 flex-wrap gap-3">
        <h1 className="text-xl font-medium text-text-main">Database Viewer</h1>
        <div className="flex gap-3">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-sub" width={13} height={13} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="検索..."
              className="bg-bg-panel border border-border-dark rounded-full pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:border-accent placeholder-text-sub"
            />
          </div>
          <select value={table} onChange={(e) => setTable(e.target.value)} className="bg-bg-panel border border-border-dark rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent">
            {tables.map((t) => (
              <option key={t} value={t}>
                Table: {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-bg-panel border border-border-dark rounded-lg shadow-sm">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-bg-card text-text-sub text-xs sticky top-0 z-10 shadow-sm">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-4 py-3 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dark">
            {data?.rows.map((row, i) => (
              <tr key={i} className="hover:bg-bg-base">
                {columns.map((c) => (
                  <td key={c} className={`px-4 py-2 truncate max-w-[280px] ${c === 'lora_name' && row[c] ? 'text-purple-400' : ''}`} title={formatCell(row[c])}>
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.rows.length === 0 && <div className="text-text-sub text-sm text-center py-10">データがありません</div>}
      </div>

      {data && data.total_pages > 1 && (
        <div className="flex justify-between items-center mt-3 shrink-0 text-xs text-text-sub">
          <span>
            {data.total} 件中 {(data.page - 1) * data.page_size + 1}-{Math.min(data.page * data.page_size, data.total)} 件を表示
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 bg-bg-panel border border-border-dark rounded disabled:opacity-40 hover:border-accent"
            >
              前へ
            </button>
            <span className="px-2 py-1">
              {data.page} / {data.total_pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
              disabled={page >= data.total_pages}
              className="px-3 py-1 bg-bg-panel border border-border-dark rounded disabled:opacity-40 hover:border-accent"
            >
              次へ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
