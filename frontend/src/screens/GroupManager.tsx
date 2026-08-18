import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Group, Item, Pool } from '../types'
import { useDebounced } from '../hooks/useDebounced'
import ItemCard from '../components/ItemCard'
import ItemPickerModal from '../components/ItemPickerModal'
import { IconPen, IconPlus, IconSearch, IconTrash } from '../components/Icons'

type SearchScope = 'group' | 'pool'

export default function GroupManager() {
  const [pools, setPools] = useState<Pool[]>([])
  const [selectedPool, setSelectedPool] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  const [groupItems, setGroupItems] = useState<Item[]>([])
  const [poolSearchItems, setPoolSearchItems] = useState<Item[]>([])
  const [scope, setScope] = useState<SearchScope>('group')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  useEffect(() => {
    api.listPools().then((ps) => {
      setPools(ps)
      if (ps.length > 0) setSelectedPool(ps[0].key)
    })
  }, [])

  useEffect(() => {
    if (!selectedPool) return
    api.listGroups({ pool: selectedPool }).then((gs) => {
      setGroups(gs)
      setSelectedGroupId((prev) => (gs.find((g) => g.id === prev) ? prev : gs[0]?.id ?? null))
    })
  }, [selectedPool])

  function refreshGroups() {
    api.listGroups({ pool: selectedPool }).then(setGroups)
  }

  function loadGroupItems() {
    if (selectedGroupId == null) {
      setGroupItems([])
      return
    }
    api.getGroupItems(selectedGroupId).then(setGroupItems)
  }

  useEffect(() => {
    loadGroupItems()
    setSelectedIds([])
    setLastClickedIndex(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId])

  const filteredGroupItems = debouncedSearch
    ? groupItems.filter(
        (it) => it.name.toLowerCase().includes(debouncedSearch.toLowerCase()) || it.positive.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : groupItems

  useEffect(() => {
    if (scope !== 'pool' || !selectedPool) return
    api.listItems({ pool: selectedPool, search: debouncedSearch || undefined }).then(setPoolSearchItems)
  }, [scope, selectedPool, debouncedSearch])

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null

  function onItemClick(index: number, item: Item, e: React.MouseEvent) {
    if (e.shiftKey && lastClickedIndex !== null) {
      const [start, end] = [lastClickedIndex, index].sort((a, b) => a - b)
      const rangeIds = filteredGroupItems.slice(start, end + 1).map((it) => it.id)
      setSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])))
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]))
      setLastClickedIndex(index)
    } else {
      setSelectedIds((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]))
      setLastClickedIndex(index)
    }
  }

  function toggleSelectAll() {
    if (selectedIds.length === filteredGroupItems.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredGroupItems.map((it) => it.id))
    }
  }

  async function removeSelectedFromGroup() {
    if (selectedGroupId == null || selectedIds.length === 0) return
    if (!confirm(`選択した ${selectedIds.length} 件をグループ「${selectedGroup?.name}」から削除しますか?(アイテム自体は削除されません)`)) return
    await Promise.all(selectedIds.map((id) => api.removeItemFromGroupBulk(selectedGroupId, id)))
    setSelectedIds([])
    loadGroupItems()
    refreshGroups()
  }

  async function addItemsToGroup(itemIds: number[]) {
    if (selectedGroupId == null) return
    await api.addItemsToGroup(selectedGroupId, itemIds)
    setPickerOpen(false)
    loadGroupItems()
    refreshGroups()
  }

  async function quickAddFromPool(item: Item) {
    if (selectedGroupId == null) return
    await api.addItemsToGroup(selectedGroupId, [item.id])
    loadGroupItems()
    refreshGroups()
  }

  async function quickRemoveFromPool(item: Item) {
    if (selectedGroupId == null) return
    await api.removeItemFromGroupBulk(selectedGroupId, item.id)
    loadGroupItems()
    refreshGroups()
  }

  async function createGroup() {
    if (!newGroupName.trim()) return
    const g = await api.createGroup({ pool: selectedPool, name: newGroupName.trim() })
    setNewGroupName('')
    setCreatingGroup(false)
    setGroups((prev) => [...prev, g])
    setSelectedGroupId(g.id)
    setScope('pool')
  }

  async function submitRename(id: number) {
    if (!renameValue.trim()) return
    await api.updateGroup(id, { name: renameValue.trim() })
    setRenamingId(null)
    refreshGroups()
  }

  async function deleteGroup(id: number) {
    if (!confirm('このグループを削除しますか?(アイテム自体は削除されません)')) return
    await api.deleteGroup(id)
    if (selectedGroupId === id) setSelectedGroupId(null)
    refreshGroups()
  }

  return (
    <div className="flex-1 h-full w-full flex">
      <div className="w-64 bg-bg-panel border-r border-border-dark flex flex-col z-10 shrink-0">
        <div className="p-4 border-b border-border-dark bg-bg-card">
          <select
            value={selectedPool}
            onChange={(e) => setSelectedPool(e.target.value)}
            className="w-full bg-bg-base border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent cursor-pointer mb-3"
          >
            {pools.map((p) => (
              <option key={p.key} value={p.key}>
                {p.display_name}
              </option>
            ))}
          </select>
          <div className="flex justify-between items-center">
            <h2 className="font-medium text-text-main">Groups</h2>
            <button
              onClick={() => setCreatingGroup(true)}
              className="w-6 h-6 rounded bg-accent text-white flex items-center justify-center hover:bg-accent-hover transition-colors"
            >
              <IconPlus width={12} height={12} />
            </button>
          </div>
          {creatingGroup && (
            <div className="mt-2 flex gap-1">
              <input
                autoFocus
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createGroup()}
                placeholder="新規グループ名"
                className="flex-1 bg-bg-base border border-border-dark rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
              />
              <button onClick={createGroup} className="text-accent text-xs px-2">
                OK
              </button>
            </div>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
          {groups.map((g) => (
            <li
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={`px-4 py-2 flex justify-between items-center group cursor-pointer ${
                selectedGroupId === g.id ? 'bg-bg-base border-l-2 border-accent' : 'hover:bg-bg-base text-text-sub'
              }`}
            >
              {renamingId === g.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitRename(g.id)}
                  onBlur={() => submitRename(g.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-bg-base border border-accent rounded px-1 text-sm"
                />
              ) : (
                <span className={`text-sm truncate ${selectedGroupId === g.id ? 'text-accent font-medium' : ''}`}>
                  {g.name} <span className="text-[10px] opacity-60">({g.item_count})</span>
                </span>
              )}
              <div className="opacity-0 group-hover:opacity-100 flex gap-2 text-text-sub shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenamingId(g.id)
                    setRenameValue(g.name)
                  }}
                  className="hover:text-text-main"
                >
                  <IconPen width={11} height={11} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteGroup(g.id)
                  }}
                  className="hover:text-red-400"
                >
                  <IconTrash width={11} height={11} />
                </button>
              </div>
            </li>
          ))}
          {groups.length === 0 && <li className="px-4 py-2 text-text-sub text-sm">グループがありません</li>}
        </ul>
      </div>

      <div className="flex-1 bg-bg-base flex flex-col p-6 overflow-hidden">
        {selectedGroup ? (
          <>
            <div className="flex justify-between items-center mb-6 shrink-0">
              <div>
                <h1 className="text-xl font-medium text-text-main">{selectedGroup.name}</h1>
                <p className="text-xs text-text-sub mt-1">Pool: {pools.find((p) => p.key === selectedPool)?.display_name}</p>
              </div>
              <button
                onClick={() => setPickerOpen(true)}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md font-medium transition-colors shadow-sm flex items-center gap-1.5"
              >
                <IconPlus width={14} height={14} /> グループにアイテムを追加
              </button>
            </div>

            <div className="bg-bg-panel rounded-lg border border-border-dark flex-1 flex flex-col overflow-hidden shadow-sm">
              <div className="p-3 border-b border-border-dark flex justify-between items-center bg-bg-card flex-wrap gap-2">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filteredGroupItems.length > 0 && selectedIds.length === filteredGroupItems.length}
                      onChange={toggleSelectAll}
                      disabled={scope !== 'group'}
                      className="w-4 h-4 accent-accent rounded cursor-pointer"
                    />
                    <span className="text-xs text-text-sub">全て選択</span>
                  </label>
                  <button
                    onClick={removeSelectedFromGroup}
                    disabled={scope !== 'group' || selectedIds.length === 0}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 bg-red-500/10 px-2 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <IconTrash width={11} height={11} /> 選択したアイテムをグループから削除 ({selectedIds.length})
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex bg-bg-base rounded-full p-0.5 border border-border-dark">
                    {(['group', 'pool'] as SearchScope[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setScope(s)
                          setSelectedIds([])
                        }}
                        className={`px-3 py-1 text-xs rounded-full transition-colors ${
                          scope === s ? 'bg-bg-card text-text-main shadow border border-border-dark font-medium' : 'text-text-sub hover:text-text-main'
                        }`}
                      >
                        {s === 'group' ? 'グループ内' : 'プール全体'}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-48">
                    <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-sub" width={11} height={11} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      type="text"
                      placeholder="検索..."
                      className="w-full bg-bg-base border border-border-dark rounded pl-8 pr-3 py-1 text-xs focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>
              {scope === 'pool' && (
                <div className="px-3 py-1.5 text-[11px] text-text-sub bg-bg-base border-b border-border-dark">
                  プール全体から検索中: カードをクリックするとこのグループに追加/削除されます
                </div>
              )}

              <div className="flex-1 p-4 overflow-y-auto">
                <div className="item-grid">
                  {scope === 'group'
                    ? filteredGroupItems.map((item, i) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          showCheckbox
                          selected={selectedIds.includes(item.id)}
                          onClick={(e) => onItemClick(i, item, e)}
                        />
                      ))
                    : poolSearchItems.map((item) => {
                        const inGroup = groupItems.some((gi) => gi.id === item.id)
                        return (
                          <ItemCard
                            key={item.id}
                            item={item}
                            selected={inGroup}
                            faded={inGroup}
                            onClick={() => (inGroup ? quickRemoveFromPool(item) : quickAddFromPool(item))}
                          />
                        )
                      })}
                </div>
                {scope === 'group' && filteredGroupItems.length === 0 && (
                  <div className="text-text-sub text-sm text-center mt-10">このグループにはアイテムがありません</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-text-sub text-sm m-auto">グループを選択するか、新規作成してください</div>
        )}
      </div>

      {pickerOpen && selectedGroupId != null && (
        <ItemPickerModal
          pools={pools}
          defaultPool={selectedPool}
          lockPool
          excludeItemIds={groupItems.map((it) => it.id)}
          onClose={() => setPickerOpen(false)}
          onConfirm={addItemsToGroup}
        />
      )}
    </div>
  )
}
