import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Group, Item, ItemType, Pool } from '../types'
import { useDebounced } from '../hooks/useDebounced'
import ItemEditPanel from '../components/ItemEditPanel'
import ComposeFinishedDialog from '../components/ComposeFinishedDialog'
import { IconImage, IconObjectGroup, IconPen, IconPlus, IconSearch } from '../components/Icons'

export default function ItemsManager() {
  const [pools, setPools] = useState<Pool[]>([])
  const [poolFilter, setPoolFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<ItemType | ''>('')
  const [groups, setGroups] = useState<Group[]>([])
  const [groupFilter, setGroupFilter] = useState<number | ''>('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [items, setItems] = useState<Item[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [sortAsc, setSortAsc] = useState(true)

  const [editingId, setEditingId] = useState<number | null | undefined>(undefined) // undefined = closed
  const [composeOpen, setComposeOpen] = useState(false)

  useEffect(() => {
    api.listPools().then(setPools)
  }, [])

  useEffect(() => {
    setGroupFilter('')
    if (!poolFilter) {
      setGroups([])
      return
    }
    api.listGroups({ pool: poolFilter }).then(setGroups)
  }, [poolFilter])

  function refresh() {
    api
      .listItems({
        pool: poolFilter || undefined,
        type: (typeFilter as ItemType) || undefined,
        group_id: groupFilter || undefined,
        search: debouncedSearch || undefined,
      })
      .then(setItems)
  }

  useEffect(refresh, [poolFilter, typeFilter, groupFilter, debouncedSearch])

  function toggleSelect(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === items.length ? [] : items.map((it) => it.id)))
  }

  const selectedParts = items.filter((it) => selectedIds.includes(it.id) && it.type === 'part')

  const sortedItems = [...items].sort((a, b) => (sortAsc ? 1 : -1) * a.name.localeCompare(b.name, 'ja'))

  function poolLabel(key: string) {
    return pools.find((p) => p.key === key)?.display_name ?? key
  }

  return (
    <div className="flex-1 h-full w-full relative overflow-hidden">
      <div className="flex-1 bg-bg-base flex flex-col p-6 h-full overflow-hidden">
        <div className="flex justify-between items-center mb-4 shrink-0 flex-wrap gap-3">
          <h1 className="text-xl font-medium text-text-main">Items Management</h1>
          <div className="flex gap-3">
            <button
              onClick={() => setComposeOpen(true)}
              disabled={selectedParts.length === 0}
              className="px-4 py-2 bg-bg-panel border border-border-dark hover:border-accent hover:text-accent rounded-md transition-colors text-sm shadow-sm flex items-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconObjectGroup width={14} height={14} className="mr-1.5" />
              選択から完成品作成 {selectedParts.length > 0 && `(${selectedParts.length})`}
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md transition-colors text-sm shadow-sm flex items-center"
            >
              <IconPlus width={14} height={14} className="mr-1.5" /> 新規アイテム
            </button>
          </div>
        </div>

        <div className="flex gap-3 mb-4 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-sub" width={13} height={13} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名前やプロンプトで検索..."
              className="w-full bg-bg-panel border border-border-dark rounded-full pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:border-accent placeholder-text-sub"
            />
          </div>
          <select
            value={poolFilter}
            onChange={(e) => setPoolFilter(e.target.value)}
            className="bg-bg-panel border border-border-dark rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
          >
            <option value="">All Pools</option>
            {pools.map((p) => (
              <option key={p.key} value={p.key}>
                {p.display_name}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ItemType | '')}
            className="bg-bg-panel border border-border-dark rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
          >
            <option value="">All Types</option>
            <option value="finished">Finished</option>
            <option value="part">Part</option>
          </select>
          {poolFilter && (
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value ? Number(e.target.value) : '')}
              className="bg-bg-panel border border-border-dark rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            >
              <option value="">All Groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="bg-bg-panel rounded-lg border border-border-dark flex-1 overflow-hidden flex flex-col shadow-sm">
          <div className="grid grid-cols-12 gap-4 p-3 border-b border-border-dark bg-bg-card text-xs font-medium text-text-sub items-center shrink-0">
            <div className="col-span-3 flex items-center gap-2">
              <input type="checkbox" checked={items.length > 0 && selectedIds.length === items.length} onChange={toggleSelectAll} className="w-3.5 h-3.5 accent-accent rounded cursor-pointer" />
              <button onClick={() => setSortAsc((v) => !v)} className="flex items-center gap-1 hover:text-text-main transition-colors">
                Name <span className="text-[10px]">{sortAsc ? '▲' : '▼'}</span>
              </button>
            </div>
            <div className="col-span-2">Pool</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-4">Prompt Preview</div>
            <div className="col-span-1 text-right">Edit</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sortedItems.map((item) => (
              <div
                key={item.id}
                onClick={() => toggleSelect(item.id)}
                className="grid grid-cols-12 gap-4 p-3 border-b border-border-dark hover:bg-bg-card items-center transition-colors text-sm cursor-pointer"
              >
                <div className="col-span-3 flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-3.5 h-3.5 accent-accent rounded cursor-pointer shrink-0"
                  />
                  <div className="w-8 h-8 bg-bg-base rounded flex items-center justify-center shrink-0 border border-border-dark overflow-hidden">
                    {item.image_path ? <img src={item.image_path} className="w-full h-full object-cover" /> : <IconImage width={13} height={13} className="text-text-sub" />}
                  </div>
                  <span className="font-medium truncate" title={item.name}>
                    {item.name}
                  </span>
                </div>
                <div className="col-span-2 text-xs text-text-sub truncate">{poolLabel(item.pool)}</div>
                <div className="col-span-2">
                  <span className={`px-2 py-0.5 border rounded text-[10px] ${item.type === 'finished' ? 'bg-bg-base border-border-dark' : 'bg-bg-base border-purple-500/40 text-purple-300'}`}>
                    {item.type === 'finished' ? 'Finished' : 'Part'}
                  </span>
                </div>
                <div className="col-span-4 text-xs text-text-sub truncate">{item.positive}</div>
                <div className="col-span-1 text-right">
                  <button onClick={(e) => { e.stopPropagation(); setEditingId(item.id) }} className="text-text-sub hover:text-accent transition-colors">
                    <IconPen width={14} height={14} />
                  </button>
                </div>
              </div>
            ))}
            {items.length === 0 && <div className="text-text-sub text-sm text-center mt-10">アイテムが見つかりません</div>}
          </div>
        </div>
      </div>

      {editingId !== undefined && (
        <ItemEditPanel
          itemId={editingId}
          initialPool={poolFilter || pools[0]?.key || ''}
          pools={pools}
          onClose={() => setEditingId(undefined)}
          onSaved={() => {
            refresh()
          }}
          onDeleted={() => {
            setEditingId(undefined)
            setSelectedIds([])
            refresh()
          }}
        />
      )}

      {composeOpen && (
        <ComposeFinishedDialog
          parts={selectedParts}
          pools={pools}
          onClose={() => setComposeOpen(false)}
          onCreated={(created) => {
            setComposeOpen(false)
            setSelectedIds([])
            refresh()
            setEditingId(created.id)
          }}
        />
      )}
    </div>
  )
}
