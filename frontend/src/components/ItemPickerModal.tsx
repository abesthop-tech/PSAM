import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { Item, Pool } from '../types'
import { useDebounced } from '../hooks/useDebounced'
import { IconSearch, IconX } from './Icons'
import ItemCard from './ItemCard'

interface Props {
  title?: string
  pools: Pool[]
  defaultPool?: string
  lockPool?: boolean
  excludeItemIds?: number[]
  multiple?: boolean
  onClose: () => void
  onConfirm: (itemIds: number[]) => void
}

export default function ItemPickerModal({
  title = 'アイテムを選択して追加',
  pools,
  defaultPool,
  lockPool,
  excludeItemIds = [],
  multiple = true,
  onClose,
  onConfirm,
}: Props) {
  const [poolFilter, setPoolFilter] = useState(defaultPool ?? '')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const excludeSet = useMemo(() => new Set(excludeItemIds), [excludeItemIds])

  useEffect(() => {
    api.listItems({ pool: poolFilter || undefined, search: debouncedSearch || undefined }).then(setItems)
  }, [poolFilter, debouncedSearch])

  const visibleItems = items.filter((it) => !excludeSet.has(it.id))

  function toggle(id: number) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (!multiple) return [id]
      return [...prev, id]
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-100 flex items-center justify-center">
      <div className="bg-bg-panel rounded-xl border border-border-dark w-[800px] max-w-[95vw] h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border-dark">
          <h3 className="text-lg font-medium">{title}</h3>
          <button onClick={onClose} className="text-text-sub hover:text-white w-8 h-8 flex justify-center items-center rounded-full hover:bg-bg-card">
            <IconX />
          </button>
        </div>

        <div className="p-4 flex gap-3 border-b border-border-dark bg-bg-base">
          <select
            value={poolFilter}
            disabled={lockPool}
            onChange={(e) => setPoolFilter(e.target.value)}
            className="bg-bg-card border border-border-dark text-sm rounded px-3 py-2 focus:outline-none focus:border-accent disabled:opacity-60"
          >
            <option value="">All Pools</option>
            {pools.map((p) => (
              <option key={p.key} value={p.key}>
                {p.display_name}
              </option>
            ))}
          </select>
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-sub" width={14} height={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="text"
              placeholder="名前やタグで検索..."
              className="w-full bg-bg-card border border-border-dark text-sm rounded pl-9 pr-3 py-2 focus:outline-none focus:border-accent placeholder-text-sub"
            />
          </div>
        </div>

        <div className="flex-1 p-5 overflow-y-auto bg-[#1e1e1e]">
          <div className="item-grid">
            {visibleItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                showCheckbox={multiple}
                selected={selected.includes(item.id)}
                onClick={() => toggle(item.id)}
              />
            ))}
          </div>
          {visibleItems.length === 0 && <div className="text-text-sub text-sm text-center mt-10">アイテムが見つかりません</div>}
        </div>

        <div className="p-4 border-t border-border-dark flex justify-between items-center bg-bg-panel rounded-b-xl">
          <span className="text-sm text-text-sub">{selected.length} 個選択中</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2 rounded text-sm text-text-main bg-bg-card border border-border-dark hover:bg-[#333] transition-colors">
              キャンセル
            </button>
            <button
              onClick={() => onConfirm(selected)}
              disabled={selected.length === 0}
              className="px-5 py-2 rounded text-sm text-white bg-accent hover:bg-accent-hover transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              追加する
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
