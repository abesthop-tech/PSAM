import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { Group, Item, Pool } from '../types'
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
  /** Shows the category / group / search controls used by Comfy replacement rules. */
  allowGroupFilter?: boolean
  showLoraStrengths?: boolean
  initialSelectedIds?: number[]
  initialLoraStrengths?: Record<number, { model: number; clip: number }>
  confirmLabel?: string
  onSelectionChange?: (selection: { pool: string; groupId: number | null; itemIds: number[]; items: Item[]; loraStrengths: Record<number, { model: number; clip: number }> }) => void
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
  allowGroupFilter = false,
  showLoraStrengths = false,
  initialSelectedIds = [],
  initialLoraStrengths = {},
  confirmLabel = '追加する',
  onSelectionChange,
  onClose,
  onConfirm,
}: Props) {
  const [poolFilter, setPoolFilter] = useState(defaultPool ?? '')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [items, setItems] = useState<Item[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [groupId, setGroupId] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>(initialSelectedIds)
  const [loraStrengths, setLoraStrengths] = useState<Record<number, { model: number; clip: number }>>(initialLoraStrengths)
  const [bulkStrength, setBulkStrength] = useState({ model: 1, clip: 1 })
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)
  const excludeSet = useMemo(() => new Set(excludeItemIds), [excludeItemIds])

  useEffect(() => {
    api.listItems({ pool: poolFilter || undefined, group_id: groupId ?? undefined, search: debouncedSearch || undefined }).then(setItems)
  }, [poolFilter, groupId, debouncedSearch])

  useEffect(() => {
    if (!allowGroupFilter || !poolFilter) { setGroups([]); return }
    void api.listGroups({ pool: poolFilter }).then(setGroups)
  }, [allowGroupFilter, poolFilter])

  useEffect(() => { setGroupId(null) }, [poolFilter])

  const visibleItems = items.filter((it) => !excludeSet.has(it.id))

  function toggle(id: number) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (!multiple) return [id]
      return [...prev, id]
    })
  }

  function onItemClick(index: number, item: Item, e: React.MouseEvent) {
    if (multiple && e.shiftKey && lastClickedIndex !== null) {
      const [start, end] = [lastClickedIndex, index].sort((a, b) => a - b)
      const rangeIds = visibleItems.slice(start, end + 1).map((it) => it.id)
      setSelected((prev) => Array.from(new Set([...prev, ...rangeIds])))
      return
    }
    toggle(item.id)
    setLastClickedIndex(index)
  }

  function strength(item: Item) {
    return loraStrengths[item.id] ?? {
      model: 1,
      clip: 1,
    }
  }

  function updateStrength(item: Item, key: 'model' | 'clip', value: number) {
    setLoraStrengths((current) => ({ ...current, [item.id]: { ...strength(item), [key]: value } }))
  }

  function applyBulkStrength() {
    setLoraStrengths((current) => ({
      ...current,
      ...Object.fromEntries(selectedLoraItems.map((item) => [item.id, { ...bulkStrength }])),
    }))
  }

  const selectedLoraItems = visibleItems.filter((item) => selected.includes(item.id) && item.lora_name)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-100 flex items-center justify-center p-4">
      <div className="bg-bg-panel rounded-xl border border-border-dark w-[900px] max-w-full h-[min(860px,calc(100vh-2rem))] min-h-0 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border-dark">
          <h3 className="text-lg font-medium">{title}</h3>
          <button onClick={onClose} className="text-text-sub hover:text-white w-8 h-8 flex justify-center items-center rounded-full hover:bg-bg-card">
            <IconX />
          </button>
        </div>

        <div className="p-4 flex flex-wrap gap-3 border-b border-border-dark bg-bg-base shrink-0">
          {lockPool ? (
            <span className="bg-bg-card border border-border-dark text-sm text-text-sub rounded px-3 py-2">
              {pools.find((p) => p.key === poolFilter)?.display_name ?? poolFilter}
            </span>
          ) : (
            <label className="flex min-w-36 flex-col text-xs text-text-sub">カテゴリー<select
              value={poolFilter}
              onChange={(e) => setPoolFilter(e.target.value)}
              className="mt-1 w-full bg-bg-card border border-border-dark text-sm rounded px-3 py-2 focus:outline-none focus:border-accent"
            >
              <option value="">すべて</option>
              {pools.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.display_name}
                </option>
              ))}
            </select></label>
          )}
          {allowGroupFilter && <label className="min-w-36 text-xs text-text-sub">グループ<select value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)} className="mt-1 w-full bg-bg-card border border-border-dark text-sm rounded px-3 py-2 focus:outline-none focus:border-accent"><option value="">すべて</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
          <div className="relative flex-1">
            <span className="mb-1 block text-xs text-text-sub">検索</span>
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

        <div className="min-h-0 flex-1 p-5 overflow-y-auto bg-[#1e1e1e]">
          <div className="item-grid">
            {visibleItems.map((item, i) => (
              <ItemCard
                key={item.id}
                item={item}
                showCheckbox={multiple}
                selected={selected.includes(item.id)}
                onClick={(e) => onItemClick(i, item, e)}
              />
            ))}
          </div>
          {visibleItems.length === 0 && <div className="text-text-sub text-sm text-center mt-10">アイテムが見つかりません</div>}
        </div>

        {showLoraStrengths && selectedLoraItems.length > 0 && <div className="max-h-56 shrink-0 overflow-y-auto border-t border-border-dark bg-bg-base px-4 py-3">
          <div className="mb-2 flex flex-wrap items-end gap-3">
            <div className="mr-auto text-xs font-medium text-text-main">選択候補のLoRA強度</div>
            <label className="w-28 text-[10px] text-text-sub">一括 Model<input type="number" min="-10" max="10" step="0.05" value={bulkStrength.model.toFixed(2)} onChange={(e) => setBulkStrength((current) => ({ ...current, model: Number(e.target.value) }))} className="mt-1 w-full rounded border border-border-dark bg-bg-panel px-2 py-1 text-xs text-text-main" /></label>
            <label className="w-28 text-[10px] text-text-sub">一括 CLIP<input type="number" min="-10" max="10" step="0.05" value={bulkStrength.clip.toFixed(2)} onChange={(e) => setBulkStrength((current) => ({ ...current, clip: Number(e.target.value) }))} className="mt-1 w-full rounded border border-border-dark bg-bg-panel px-2 py-1 text-xs text-text-main" /></label>
            <button type="button" onClick={applyBulkStrength} className="rounded border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent/10">選択中すべてに適用</button>
          </div>
          <div className="space-y-2">{selectedLoraItems.map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_110px_110px] items-end gap-3 rounded border border-border-dark bg-bg-panel px-3 py-2">
            <div className="min-w-0"><div className="truncate text-xs">{item.name}</div><div className="truncate text-[10px] text-text-sub">{item.lora_name}</div></div>
            <label className="text-[10px] text-text-sub">Model Strength<input type="number" min="-10" max="10" step="0.05" value={strength(item).model.toFixed(2)} onChange={(e) => updateStrength(item, 'model', Number(e.target.value))} className="mt-1 w-full rounded border border-border-dark bg-bg-base px-2 py-1 text-xs text-text-main" /></label>
            <label className="text-[10px] text-text-sub">CLIP Strength<input type="number" min="-10" max="10" step="0.05" value={strength(item).clip.toFixed(2)} onChange={(e) => updateStrength(item, 'clip', Number(e.target.value))} className="mt-1 w-full rounded border border-border-dark bg-bg-base px-2 py-1 text-xs text-text-main" /></label>
          </div>)}</div>
        </div>}

        <div className="p-4 border-t border-border-dark flex flex-wrap gap-3 justify-between items-center bg-bg-panel rounded-b-xl shrink-0">
          <span className="text-sm text-text-sub">{selected.length} 個選択中</span>
          <div className="flex gap-3">
            {multiple && <><button onClick={() => setSelected(visibleItems.map((item) => item.id))} className="px-3 py-2 rounded text-sm text-text-main bg-bg-card border border-border-dark hover:bg-[#333]">全選択</button><button onClick={() => setSelected([])} className="px-3 py-2 rounded text-sm text-text-main bg-bg-card border border-border-dark hover:bg-[#333]">全解除</button></>}
            <button onClick={onClose} className="px-5 py-2 rounded text-sm text-text-main bg-bg-card border border-border-dark hover:bg-[#333] transition-colors">
              戻る
            </button>
            <button
              onClick={() => {
                const selectedItems = visibleItems.filter((item) => selected.includes(item.id))
                const resolvedStrengths = Object.fromEntries(
                  selectedItems.filter((item) => item.lora_name).map((item) => [item.id, strength(item)]),
                )
                onSelectionChange?.({ pool: poolFilter, groupId, itemIds: selected, items: selectedItems, loraStrengths: resolvedStrengths })
                onConfirm(selected)
              }}
              disabled={selected.length === 0}
              className="px-5 py-2 rounded text-sm text-white bg-accent hover:bg-accent-hover transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
