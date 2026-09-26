import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Group, Item, ItemType, Pool, PromptSet } from '../types'
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
import ItemEditPanel from '../components/ItemEditPanel'
import PromptSetModal from '../components/PromptSetModal'
import Resizer from '../components/Resizer'
import { IconBan, IconCopy, IconDice, IconLightbulb, IconSearch, IconTrash, IconWand, IconX } from '../components/Icons'

interface AddedEntry {
  item: Item
  variantIndex: number
  insertedPositive: string
  insertedNegative: string
  loraModel: number | null
  loraClip: number | null
}

interface Snapshot {
  entries: AddedEntry[]
  positive: string
  negative: string
  linkIdsByItem: Record<number, number[]>
  lastPosGroup: string | null
  lastNegGroup: string | null
}

const NEGATIVE_GROUP = '__negative__'

export default function PromptBuilder() {
  const navigate = useNavigate()
  const [pools, setPools] = useState<Pool[]>([])
  const [selectedPool, setSelectedPool] = useState<string>('')
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [showUngrouped, setShowUngrouped] = useState(false)
  const [groupSearch, setGroupSearch] = useState('')
  const debouncedGroupSearch = useDebounced(groupSearch)

  const [typeFilter, setTypeFilter] = useState<'' | ItemType>('')
  const [itemSearch, setItemSearch] = useState('')
  const debouncedItemSearch = useDebounced(itemSearch)
  const [centerItems, setCenterItems] = useState<Item[]>([])

  const [entries, setEntries] = useState<AddedEntry[]>([])
  const [positive, setPositive] = useState('')
  const [negative, setNegative] = useState('')
  const [linkedInfo, setLinkedInfo] = useState<Record<number, Item>>({})
  const [linkIdsByItem, setLinkIdsByItem] = useState<Record<number, number[]>>({})
  const [lastPosGroup, setLastPosGroup] = useState<string | null>(null)
  const [lastNegGroup, setLastNegGroup] = useState<string | null>(null)

  const [leftWidth, setLeftWidth] = useState(256)
  const [rightWidth, setRightWidth] = useState(320)
  const [favoriteIds, setFavoriteIds] = useState<number[]>([])
  const [specialView, setSpecialView] = useState<'normal' | 'favorites' | 'recent'>('normal')
  const [editingId, setEditingId] = useState<number | undefined>(undefined)
  const [promptSetsOpen, setPromptSetsOpen] = useState(false)

  const historyRef = useRef<Snapshot[]>([])

  function pushHistory() {
    historyRef.current.push({ entries, positive, negative, linkIdsByItem, lastPosGroup, lastNegGroup })
    if (historyRef.current.length > 50) historyRef.current.shift()
  }

  function undo() {
    const snap = historyRef.current.pop()
    if (!snap) return
    setEntries(snap.entries)
    setPositive(snap.positive)
    setNegative(snap.negative)
    setLinkIdsByItem(snap.linkIdsByItem)
    setLastPosGroup(snap.lastPosGroup)
    setLastNegGroup(snap.lastNegGroup)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return
      e.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    api.listPools().then((ps) => {
      setPools(ps)
      if (ps.length > 0) setSelectedPool(ps[0].key)
    })
    api.listFavoriteIds().then(setFavoriteIds)
  }, [])

  useEffect(() => {
    if (!selectedPool) return
    api.listGroups({ pool: selectedPool, search: debouncedGroupSearch || undefined }).then((gs) => {
      setGroups(gs)
      setSelectedGroupId((prev) => debouncedGroupSearch ? prev : null)
      if (!debouncedGroupSearch) setShowUngrouped(false)
    })
  }, [selectedPool, debouncedGroupSearch])

  useEffect(() => {
    if (!selectedPool) return
    api
      .listItems({
        pool: selectedPool,
        group_id: specialView === 'normal' && !showUngrouped ? selectedGroupId ?? undefined : undefined,
        ungrouped: specialView === 'normal' && showUngrouped,
        type: typeFilter || undefined,
        search: debouncedItemSearch || undefined,
        sort: specialView === 'recent' ? 'used' : 'name',
        order: specialView === 'recent' ? 'desc' : 'asc',
      })
      .then((items) => setCenterItems(specialView === 'favorites' ? items.filter((it) => favoriteIds.includes(it.id)) : specialView === 'recent' ? items.filter((it) => it.last_used_at).slice(0, 20) : items))
  }, [selectedPool, selectedGroupId, showUngrouped, typeFilter, debouncedItemSearch, specialView, favoriteIds])

  const addedIds = useMemo(() => new Set(entries.map((e) => e.item.id)), [entries])
  const poolIndex = useMemo(() => pools.findIndex((p) => p.key === selectedPool), [pools, selectedPool])

  function goToPool(offset: number) {
    const next = poolIndex + offset
    if (next < 0 || next >= pools.length) return
    setSelectedPool(pools[next].key)
    setSpecialView('normal')
  }

  async function toggleFavorite(itemId: number) {
    if (favoriteIds.includes(itemId)) {
      await api.removeFavorite(itemId)
      setFavoriteIds((ids) => ids.filter((id) => id !== itemId))
    } else {
      await api.addFavorite(itemId)
      setFavoriteIds((ids) => [...ids, itemId])
    }
  }

  async function refreshEditedItem(itemId: number) {
    const updated = await api.getItem(itemId)
    setCenterItems((items) => items.map((it) => it.id === itemId ? updated : it))
    setEntries((current) => current.map((entry) => entry.item.id === itemId ? { ...entry, item: updated } : entry))
  }

  async function loadPromptSet(set: PromptSet) {
    const loaded: (AddedEntry | null)[] = await Promise.all(set.entries.map(async (saved): Promise<AddedEntry | null> => {
      const item = await api.getItem(saved.item_id).catch(() => null)
      if (!item) return null
      const variantIndex = Math.min(saved.variant_index, Math.max(item.variants.length - 1, 0))
      return {
        item, variantIndex,
        insertedPositive: item.variants[variantIndex]?.variant_text ?? item.positive,
        insertedNegative: item.negative,
        loraModel: saved.lora_model,
        loraClip: saved.lora_clip,
      }
    }))
    const valid = loaded.filter((entry): entry is AddedEntry => entry !== null)
    historyRef.current = []
    setEntries(valid)
    setPositive(set.positive)
    setNegative(set.negative)
    setLinkedInfo({})
    setLinkIdsByItem({})
    setLastPosGroup(valid.at(-1)?.item.pool ?? null)
    setLastNegGroup(valid.at(-1)?.item.pool ?? null)
    setPromptSetsOpen(false)
  }

  async function addItem(item: Item) {
    if (addedIds.has(item.id)) return
    pushHistory()
    api.touchItem(item.id).catch(() => {})
    const variantText = item.variants[0]?.variant_text ?? item.positive

    let newPositive = positive
    let insertedPositive = ''
    if (variantText.trim()) {
      const r = appendSegment(newPositive, variantText, { newParagraph: lastPosGroup !== item.pool })
      newPositive = r.text
      insertedPositive = r.inserted
      setLastPosGroup(item.pool)
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
      const r = appendSegment(newNegative, item.negative, { newParagraph: lastNegGroup !== item.pool })
      newNegative = r.text
      insertedNegative = r.inserted
      setLastNegGroup(item.pool)
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
    pushHistory()
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

  function selectVariant(itemId: number, nextIndex: number) {
    pushHistory()
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.item.id === itemId)
      if (idx === -1) return prev
      const entry = prev[idx]
      const variants = entry.item.variants
      if (nextIndex === entry.variantIndex || nextIndex < 0 || nextIndex >= variants.length) return prev
      const nextText = variants[nextIndex].variant_text
      const removed = removeSegment(positive, entry.insertedPositive)
      const { text, inserted } = appendSegment(removed, nextText, { newParagraph: lastPosGroup !== entry.item.pool })
      setPositive(text)
      setLastPosGroup(entry.item.pool)
      const next = [...prev]
      next[idx] = { ...entry, variantIndex: nextIndex, insertedPositive: inserted }
      return next
    })
  }

  function updateLoraStrength(itemId: number, field: 'model' | 'clip', value: number) {
    pushHistory()
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
    pushHistory()
    setEntries([])
    setPositive('')
    setNegative('')
    setLinkIdsByItem({})
    setLastPosGroup(null)
    setLastNegGroup(null)
  }

  function insertQualityTags() {
    if (containsSegment(positive, QUALITY_TAGS)) return
    pushHistory()
    const trimmed = positive.trim()
    setPositive(trimmed ? `${QUALITY_TAGS}\n\n${trimmed}` : QUALITY_TAGS)
  }

  function insertStandardNegative() {
    if (containsSegment(negative, STANDARD_NEGATIVE)) return
    pushHistory()
    const newParagraph = lastNegGroup !== NEGATIVE_GROUP
    setNegative((prev) => appendSegment(prev, STANDARD_NEGATIVE, { newParagraph }).text)
    setLastNegGroup(NEGATIVE_GROUP)
  }

  function randomAdd() {
    const candidates = centerItems.filter((it) => !addedIds.has(it.id))
    if (candidates.length === 0) return
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    addItem(pick)
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text)
  }

  function handoffToComfy(mode: 'replace' | 'append') {
    sessionStorage.setItem('psam.comfy.handoff', JSON.stringify({
      positive,
      source_item_ids: entries.map((entry) => entry.item.id),
      mode,
    }))
    navigate('/comfy')
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
            onChange={(e) => { setSelectedPool(e.target.value); setSpecialView('normal') }}
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
          <li onClick={() => { setSpecialView('favorites'); setSelectedGroupId(null); setShowUngrouped(false) }} className={`px-4 py-2 cursor-pointer transition-colors ${specialView === 'favorites' ? 'bg-bg-card border-l-2 border-accent text-accent font-medium' : 'text-text-sub hover:bg-bg-card hover:text-text-main'}`}>★ お気に入り</li>
          <li onClick={() => { setSpecialView('recent'); setSelectedGroupId(null); setShowUngrouped(false) }} className={`px-4 py-2 cursor-pointer transition-colors ${specialView === 'recent' ? 'bg-bg-card border-l-2 border-accent text-accent font-medium' : 'text-text-sub hover:bg-bg-card hover:text-text-main'}`}>最近使ったアイテム</li>
          <li className="px-4 pt-3 pb-1 text-[10px] text-text-sub uppercase">グループ</li>
          <li
            onClick={() => {
              setSpecialView('normal')
              setSelectedGroupId(null)
              setShowUngrouped(false)
            }}
            className={`px-4 py-2 cursor-pointer transition-colors ${
              selectedGroupId === null && !showUngrouped ? 'bg-bg-card border-l-2 border-accent text-accent font-medium' : 'text-text-sub hover:bg-bg-card hover:text-text-main'
            }`}
          >
            (すべて)
          </li>
          <li
            onClick={() => {
              setSpecialView('normal')
              setSelectedGroupId(null)
              setShowUngrouped(true)
            }}
            className={`px-4 py-2 cursor-pointer transition-colors ${
              showUngrouped ? 'bg-bg-card border-l-2 border-accent text-accent font-medium' : 'text-text-sub hover:bg-bg-card hover:text-text-main'
            }`}
          >
            未分類
          </li>
          {groups.map((g) => (
            <li
              key={g.id}
              onClick={() => {
                setSpecialView('normal')
                setSelectedGroupId(g.id)
                setShowUngrouped(false)
              }}
              className={`px-4 py-2 cursor-pointer transition-colors flex justify-between items-center ${
                selectedGroupId === g.id && !showUngrouped ? 'bg-bg-card border-l-2 border-accent text-accent font-medium' : 'text-text-sub hover:bg-bg-card hover:text-text-main'
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
            {(['', 'part', 'finished'] as const).map((t) => (
              <button
                key={t || 'all'}
                onClick={() => setTypeFilter(t)}
                className={`px-4 py-1 text-xs rounded-full transition-colors ${
                  typeFilter === t ? 'bg-bg-card text-text-main shadow border border-border-dark font-medium' : 'text-text-sub hover:text-text-main'
                }`}
              >
                {t === '' ? 'すべて' : t === 'part' ? 'Part（素材）' : 'Finished（完成品）'}
              </button>
            ))}
          </div>
          <button
            onClick={randomAdd}
            title="表示中のアイテムからランダムに追加"
            className="w-8 h-8 shrink-0 flex items-center justify-center bg-bg-panel border border-border-dark hover:border-accent hover:text-accent rounded-full transition-colors"
          >
            <IconDice width={15} height={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 pb-4">
          <div className="item-grid">
            {centerItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                selected={addedIds.has(item.id)}
                onClick={() => (addedIds.has(item.id) ? removeItem(item.id) : addItem(item))}
                favorite={favoriteIds.includes(item.id)}
                onFavorite={(e) => { e.stopPropagation(); toggleFavorite(item.id) }}
                onEdit={(e) => { e.stopPropagation(); setEditingId(item.id) }}
              />
            ))}
          </div>
          {centerItems.length === 0 && <div className="text-text-sub text-sm text-center mt-10">アイテムがありません</div>}
        </div>
        <div className="flex justify-between items-center pt-3 mt-1 border-t border-border-dark shrink-0">
          <button
            onClick={() => goToPool(-1)}
            disabled={poolIndex <= 0}
            className="px-4 py-2 bg-bg-panel border border-border-dark hover:border-accent hover:text-accent rounded-md text-xs transition-colors disabled:opacity-40 disabled:hover:border-border-dark disabled:hover:text-text-main disabled:cursor-not-allowed"
          >
            ← 戻る
          </button>
          <button
            onClick={() => goToPool(1)}
            disabled={poolIndex === -1 || poolIndex >= pools.length - 1}
            className="px-4 py-2 bg-bg-panel border border-border-dark hover:border-accent hover:text-accent rounded-md text-xs transition-colors disabled:opacity-40 disabled:hover:border-border-dark disabled:hover:text-text-main disabled:cursor-not-allowed"
          >
            次へ →
          </button>
        </div>
      </div>

      <Resizer onDelta={(d) => setRightWidth((w) => Math.max(250, w - d))} />

      {/* 右カラム */}
      <div style={{ width: rightWidth }} className="min-w-[250px] bg-bg-panel flex flex-col p-4 z-10 relative overflow-y-auto shrink-0">
        <div className="mb-4">
          <div className="text-xs text-text-sub mb-2 flex justify-between items-center">
            <span>追加済みアイテム</span>
            <button onClick={clearAll} className="hover:text-red-400 transition-colors flex items-center gap-1">
              <IconTrash width={11} height={11} /> クリア
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entries.map((e) => (
              <span
                key={e.item.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-bg-base border border-border-dark rounded-md text-xs text-text-main group hover:border-accent transition-colors"
              >
                {e.item.variants.length > 1 ? (
                  <select
                    value={e.variantIndex}
                    onChange={(ev) => selectVariant(e.item.id, Number(ev.target.value))}
                    onClick={(ev) => ev.stopPropagation()}
                    title="バリエーションを選択"
                    className="bg-transparent text-text-main text-xs focus:outline-none cursor-pointer max-w-[10rem]"
                  >
                    {e.item.variants.map((v, i) => (
                      <option key={v.id} value={i} className="bg-bg-panel text-text-main">
                        {e.item.name}
                        {v.variant_text && v.variant_text !== e.item.name ? ` — ${v.variant_text}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{e.item.name}</span>
                )}
                <button onClick={() => setEditingId(e.item.id)} title="アイテムを編集" className="text-text-sub hover:text-accent">✎</button>
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
              <span className="text-purple-400">◆</span> 使用中のLoRA
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
              <label className="text-xs text-text-sub font-medium">Positiveプロンプト</label>
              <button onClick={() => copy(positive)} className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1">
                <IconCopy width={10} height={10} /> コピー
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
              <label className="text-xs text-text-sub font-medium">Negativeプロンプト</label>
              <button onClick={() => copy(negative)} className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1">
                <IconCopy width={10} height={10} /> コピー
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
        <button onClick={() => setPromptSetsOpen(true)} className="mt-2 w-full py-2 bg-bg-base border border-border-dark hover:border-accent hover:text-accent rounded-md text-xs transition-colors">プロンプトセットを保存・読み込み</button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button onClick={() => handoffToComfy('replace')} className="py-2 bg-accent text-black hover:bg-accent-hover rounded-md text-xs font-medium transition-colors">ComfyUIへ置換して渡す</button>
          <button onClick={() => handoffToComfy('append')} className="py-2 bg-bg-base border border-accent text-accent hover:bg-accent hover:text-black rounded-md text-xs font-medium transition-colors">末尾へ追加して渡す</button>
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
      {editingId !== undefined && <ItemEditPanel itemId={editingId} initialPool={selectedPool} pools={pools} onClose={() => setEditingId(undefined)} onSaved={() => refreshEditedItem(editingId)} onDeleted={() => { removeItem(editingId); setEditingId(undefined) }} />}
      {promptSetsOpen && <PromptSetModal itemCount={entries.length} positive={positive} negative={negative} entries={entries.map((entry) => ({ item_id: entry.item.id, variant_index: entry.variantIndex, lora_model: entry.loraModel, lora_clip: entry.loraClip }))} onClose={() => setPromptSetsOpen(false)} onLoad={loadPromptSet} />}
    </div>
  )
}
