import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { Group, Item, ItemType, Pool } from '../types'
import { useDebounced } from '../hooks/useDebounced'
import { QUALITY_TAGS, STANDARD_NEGATIVE } from '../constants'
import {
  appendSegment,
  containsSegment,
  removeLoraTag,
  removeSegment,
  upsertLoraTag,
} from '../utils/promptText'
import ItemCard from '../components/ItemCard'
import Resizer from '../components/Resizer'
import { IconBan, IconCopy, IconLightbulb, IconSearch, IconTrash, IconWand, IconX } from '../components/Icons'

interface AddedEntry {
  item: Item
  variantIndex: number
  insertedPositive: string
  insertedNegative: string
  loraModel: number | null
  loraClip: number | null
}

export default function PromptBuilder() {
  const [pools, setPools] = useState<Pool[]>([])
  const [selectedPool, setSelectedPool] = useState<string>('')
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [groupSearch, setGroupSearch] = useState('')
  const debouncedGroupSearch = useDebounced(groupSearch)

  const [typeFilter, setTypeFilter] = useState<ItemType>('part')
  const [itemSearch, setItemSearch] = useState('')
  const debouncedItemSearch = useDebounced(itemSearch)
  const [centerItems, setCenterItems] = useState<Item[]>([])

  const [entries, setEntries] = useState<AddedEntry[]>([])
  const [positive, setPositive] = useState('')
  const [negative, setNegative] = useState('')
  const [linkedInfo, setLinkedInfo] = useState<Record<number, Item>>({})
  const [linkIdsByItem, setLinkIdsByItem] = useState<Record<number, number[]>>({})

  const [leftWidth, setLeftWidth] = useState(256)
  const [rightWidth, setRightWidth] = useState(320)

  useEffect(() => {
    api.listPools().then((ps) => {
      setPools(ps)
      if (ps.length > 0) setSelectedPool(ps[0].key)
    })
  }, [])

  useEffect(() => {
    if (!selectedPool) return
    api.listGroups({ pool: selectedPool, search: debouncedGroupSearch || undefined }).then((gs) => {
      setGroups(gs)
      setSelectedGroupId((prev) => {
        if (debouncedGroupSearch) return prev
        return gs.length > 0 ? gs[0].id : null
      })
    })
  }, [selectedPool, debouncedGroupSearch])

  useEffect(() => {
    if (!selectedPool) return
    api
      .listItems({
        pool: selectedPool,
        group_id: selectedGroupId ?? undefined,
        type: typeFilter,
        search: debouncedItemSearch || undefined,
      })
      .then(setCenterItems)
  }, [selectedPool, selectedGroupId, typeFilter, debouncedItemSearch])

  const addedIds = useMemo(() => new Set(entries.map((e) => e.item.id)), [entries])

  async function addItem(item: Item) {
    if (addedIds.has(item.id)) return
    const variantText = item.variants[0]?.variant_text ?? item.positive

    let newPositive = positive
    let insertedPositive = ''
    if (variantText.trim()) {
      const r = appendSegment(newPositive, variantText)
      newPositive = r.text
      insertedPositive = r.inserted
    }

    let loraModel: number | null = null
    let loraClip: number | null = null
    if (item.lora_name) {
      loraModel = item.lora_model_strength ?? 1.0
      loraClip = item.lora_clip_strength
      newPositive = upsertLoraTag(newPositive, item.lora_name, loraModel, loraClip)
    }

    let newNegative = negative
    let insertedNegative = ''
    if (item.negative.trim()) {
      const r = appendSegment(newNegative, item.negative)
      newNegative = r.text
      insertedNegative = r.inserted
    }

    setPositive(newPositive)
    setNegative(newNegative)
    setEntries((prev) => [
      ...prev,
      { item, variantIndex: 0, insertedPositive, insertedNegative, loraModel, loraClip },
    ])

    try {
      const detail = await api.getItem(item.id)
      if (detail.linked_item_ids.length > 0) {
        const toFetch = detail.linked_item_ids.filter((id) => !(id in linkedInfo))
        const fetched = await Promise.all(toFetch.map((id) => api.getItem(id).catch(() => null)))
        if (fetched.some((it) => it)) {
          setLinkedInfo((prev) => {
            const next = { ...prev }
            fetched.forEach((it) => {
              if (it) next[it.id] = it
            })
            return next
          })
        }
        setLinkIdsByItem((prev) => ({ ...prev, [item.id]: detail.linked_item_ids }))
      }
    } catch {
      // ignore
    }
  }

  function removeItem(itemId: number) {
    const entry = entries.find((e) => e.item.id === itemId)
    if (!entry) return
    let newPositive = removeSegment(positive, entry.insertedPositive)
    if (entry.item.lora_name) newPositive = removeLoraTag(newPositive, entry.item.lora_name)
    const newNegative = removeSegment(negative, entry.insertedNegative)
    setPositive(newPositive)
    setNegative(newNegative)
    setEntries((prev) => prev.filter((e) => e.item.id !== itemId))
    setLinkIdsByItem((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  function cycleVariant(itemId: number) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.item.id === itemId)
      if (idx === -1) return prev
      const entry = prev[idx]
      const variants = entry.item.variants
      if (variants.length <= 1) return prev
      const nextIndex = (entry.variantIndex + 1) % variants.length
      const nextText = variants[nextIndex].variant_text
      const removed = removeSegment(positive, entry.insertedPositive)
      const { text, inserted } = appendSegment(removed, nextText)
      setPositive(text)
      const next = [...prev]
      next[idx] = { ...entry, variantIndex: nextIndex, insertedPositive: inserted }
      return next
    })
  }

  function updateLoraStrength(itemId: number, field: 'model' | 'clip', value: number) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.item.id === itemId)
      if (idx === -1) return prev
      const entry = prev[idx]
      const model = field === 'model' ? value : entry.loraModel ?? 1
      const clip = field === 'clip' ? value : entry.loraClip
      const newPositive = upsertLoraTag(positive, entry.item.lora_name!, model, clip)
      setPositive(newPositive)
      const next = [...prev]
      next[idx] = { ...entry, loraModel: model, loraClip: clip }
      return next
    })
  }

  function clearAll() {
    setEntries([])
    setPositive('')
    setNegative('')
    setLinkIdsByItem({})
  }

  function insertQualityTags() {
    if (containsSegment(positive, QUALITY_TAGS)) return
    const trimmed = positive.trim()
    setPositive(trimmed ? `${QUALITY_TAGS}, ${trimmed}` : QUALITY_TAGS)
  }

  function insertStandardNegative() {
    if (containsSegment(negative, STANDARD_NEGATIVE)) return
    setNegative((prev) => appendSegment(prev, STANDARD_NEGATIVE).text)
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text)
  }

  const suggestions = useMemo(() => {
    const seen = new Set<number>()
    const result: Item[] = []
    for (const ids of Object.values(linkIdsByItem)) {
      for (const id of ids) {
        if (addedIds.has(id) || seen.has(id)) continue
        const info = linkedInfo[id]
        if (info) {
          seen.add(id)
          result.push(info)
        }
      }
    }
    return result
  }, [linkIdsByItem, linkedInfo, addedIds])

  return (
    <div className="flex-1 flex h-full w-full">
      {/* 左カラム */}
      <div style={{ width: leftWidth }} className="min-w-[200px] bg-bg-panel flex flex-col z-10 relative shrink-0">
        <div className="p-4 border-b border-border-dark">
          <select
            value={selectedPool}
            onChange={(e) => setSelectedPool(e.target.value)}
            className="w-full bg-bg-card border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent cursor-pointer"
          >
            {pools.map((p) => (
              <option key={p.key} value={p.key}>
                {p.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="p-3 border-b border-border-dark">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-sub" width={12} height={12} />
            <input
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              type="text"
              placeholder="グループを検索..."
              className="w-full bg-bg-base border border-border-dark rounded-full pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-accent placeholder-text-sub"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
          <li
            onClick={() => setSelectedGroupId(null)}
            className={`px-4 py-2 cursor-pointer transition-colors ${
              selectedGroupId === null ? 'bg-bg-card border-l-2 border-accent text-accent font-medium' : 'text-text-sub hover:bg-bg-card hover:text-text-main'
            }`}
          >
            (すべて)
          </li>
          {groups.map((g) => (
            <li
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={`px-4 py-2 cursor-pointer transition-colors flex justify-between items-center ${
                selectedGroupId === g.id ? 'bg-bg-card border-l-2 border-accent text-accent font-medium' : 'text-text-sub hover:bg-bg-card hover:text-text-main'
              }`}
            >
              <span className="truncate">{g.name}</span>
              <span className="text-[10px] opacity-70">{g.item_count}</span>
            </li>
          ))}
        </ul>
      </div>

      <Resizer onDelta={(d) => setLeftWidth((w) => Math.max(200, w + d))} />

      {/* 中央カラム */}
      <div className="flex-1 min-w-[300px] flex flex-col bg-bg-base p-4 overflow-hidden relative">
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-sub" width={14} height={14} />
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              type="text"
              placeholder="アイテム名やプロンプトで検索..."
              className="w-full bg-bg-panel border border-border-dark rounded-full pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:border-accent placeholder-text-sub"
            />
          </div>
          <div className="flex bg-bg-panel rounded-full p-0.5 border border-border-dark">
            {(['part', 'finished'] as ItemType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-4 py-1 text-xs rounded-full transition-colors ${
                  typeFilter === t ? 'bg-bg-card text-text-main shadow border border-border-dark font-medium' : 'text-text-sub hover:text-text-main'
                }`}
              >
                {t === 'part' ? 'Part' : 'Finished'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 pb-4">
          <div className="item-grid">
            {centerItems.map((item) => (
              <ItemCard key={item.id} item={item} selected={addedIds.has(item.id)} onClick={() => addItem(item)} />
            ))}
          </div>
          {centerItems.length === 0 && <div className="text-text-sub text-sm text-center mt-10">アイテムがありません</div>}
        </div>
      </div>

      <Resizer onDelta={(d) => setRightWidth((w) => Math.max(250, w - d))} />

      {/* 右カラム */}
      <div style={{ width: rightWidth }} className="min-w-[250px] bg-bg-panel flex flex-col p-4 z-10 relative overflow-y-auto shrink-0">
        <div className="mb-4">
          <div className="text-xs text-text-sub mb-2 flex justify-between items-center">
            <span>Added Items</span>
            <button onClick={clearAll} className="hover:text-red-400 transition-colors flex items-center gap-1">
              <IconTrash width={11} height={11} /> Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entries.map((e) => (
              <span
                key={e.item.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-bg-base border border-border-dark rounded-md text-xs text-text-main group hover:border-accent transition-colors"
              >
                <span
                  onClick={() => e.item.variants.length > 1 && cycleVariant(e.item.id)}
                  className={e.item.variants.length > 1 ? 'cursor-pointer' : ''}
                  title={e.item.variants.length > 1 ? `クリックでバリエーション切替 (${e.variantIndex + 1}/${e.item.variants.length})` : undefined}
                >
                  {e.item.name}
                  {e.item.variants.length > 1 && <span className="text-accent ml-1">↻</span>}
                </span>
                <button onClick={() => removeItem(e.item.id)} className="text-text-sub hover:text-red-400 focus:outline-none">
                  <IconX width={11} height={11} />
                </button>
              </span>
            ))}
            {entries.length === 0 && <span className="text-text-sub text-xs">まだ何も追加されていません</span>}
          </div>
        </div>

        {entries.some((e) => e.item.lora_name) && (
          <div className="mb-4 bg-bg-base p-3 rounded-md border border-border-dark shadow-inner">
            <div className="text-xs text-text-sub border-b border-border-dark pb-1.5 mb-2 flex items-center gap-1">
              <span className="text-purple-400">◆</span> Active LoRAs
            </div>
            <div className="space-y-2">
              {entries
                .filter((e) => e.item.lora_name)
                .map((e) => (
                  <div key={e.item.id} className="flex items-center gap-2">
                    <span className="text-xs flex-1 truncate text-text-main" title={e.item.lora_name!}>
                      {e.item.lora_name}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={e.loraModel ?? 1}
                      onChange={(ev) => updateLoraStrength(e.item.id, 'model', parseFloat(ev.target.value))}
                      className="w-16 accent-accent cursor-pointer"
                    />
                    <input
                      type="number"
                      value={e.loraModel ?? 1}
                      step={0.1}
                      onChange={(ev) => updateLoraStrength(e.item.id, 'model', parseFloat(ev.target.value) || 0)}
                      className="w-12 bg-bg-panel border border-border-dark text-xs px-1 py-0.5 rounded text-center focus:outline-none focus:border-accent"
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col gap-3 min-h-[300px]">
          <div className="flex-1 flex flex-col">
            <div className="flex justify-between items-end mb-1">
              <label className="text-xs text-text-sub font-medium">Positive Prompt</label>
              <button onClick={() => copy(positive)} className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1">
                <IconCopy width={10} height={10} /> Copy
              </button>
            </div>
            <textarea
              value={positive}
              onChange={(e) => setPositive(e.target.value)}
              className="flex-1 w-full bg-bg-base border border-border-dark rounded-md p-2 text-text-main focus:outline-none focus:border-accent text-sm resize-none shadow-inner leading-relaxed"
            />
          </div>
          <div className="flex-1 flex flex-col">
            <div className="flex justify-between items-end mb-1">
              <label className="text-xs text-text-sub font-medium">Negative Prompt</label>
              <button onClick={() => copy(negative)} className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1">
                <IconCopy width={10} height={10} /> Copy
              </button>
            </div>
            <textarea
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
              className="flex-1 w-full bg-bg-base border border-border-dark rounded-md p-2 text-text-sub focus:outline-none focus:border-accent text-sm resize-none shadow-inner leading-relaxed"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-3 shrink-0">
          <button onClick={insertQualityTags} className="flex-1 py-2 bg-bg-base border border-border-dark hover:border-accent hover:text-accent rounded-md text-xs transition-all shadow-sm flex items-center justify-center gap-1.5">
            <IconWand width={12} height={12} /> クオリティタグ
          </button>
          <button onClick={insertStandardNegative} className="flex-1 py-2 bg-bg-base border border-border-dark hover:border-accent hover:text-accent rounded-md text-xs transition-all shadow-sm flex items-center justify-center gap-1.5">
            <IconBan width={12} height={12} /> 標準ネガ
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-4 p-3 bg-[#2a2722] border border-[#4a4231] rounded-md shadow-sm">
            <div className="text-xs text-[#d4b06a] mb-2 flex items-center gap-1 font-medium">
              <IconLightbulb width={12} height={12} /> おすすめの組み合わせ
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((it) => (
                <button
                  key={it.id}
                  onClick={() => addItem(it)}
                  className="text-[10px] px-2 py-1 bg-[#1a1a1a] border border-[#4a4231] text-text-main rounded hover:border-[#d4b06a] hover:text-[#d4b06a] transition-colors"
                >
                  + {it.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
