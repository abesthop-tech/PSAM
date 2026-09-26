import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { Item, Pool } from '../types'
import { QUALITY_TAGS, STANDARD_NEGATIVE } from '../constants'
import { upsertLoraTag } from '../utils/promptText'
import ItemPickerModal from '../components/ItemPickerModal'
import { IconCopy, IconDice, IconPlus, IconTrash, IconX } from '../components/Icons'

const ZZSTYLE = 'zzstyle'

interface Category {
  key: string
  pool: string
  label: string
}

const CATEGORIES: Category[] = [
  { key: 'headcount', pool: 'headcount', label: '人数' },
  { key: 'character', pool: 'character', label: 'キャラ' },
  { key: 'outfit', pool: 'outfit', label: '服装' },
  { key: 'expression', pool: 'expression', label: '表情' },
  { key: 'composition', pool: 'composition', label: '構図' },
  { key: 'background', pool: 'background', label: '背景' },
  { key: 'accessory', pool: 'accessory', label: '小物' },
]

interface CatEntry {
  item: Item
  variantIndex: number
  loraModel: number | null
  loraClip: number | null
}

type Selections = Record<string, CatEntry[]>

export default function QuickBuild() {
  const [pools, setPools] = useState<Pool[]>([])
  const [selections, setSelections] = useState<Selections>({})
  const [pickerCategory, setPickerCategory] = useState<string | null>(null)
  const [includeStandardNegative, setIncludeStandardNegative] = useState(true)

  useEffect(() => {
    api.listPools().then(setPools)
  }, [])

  function entriesFor(key: string): CatEntry[] {
    return selections[key] ?? []
  }

  function addItems(catKey: string, items: Item[]) {
    setSelections((prev) => {
      const existingIds = new Set((prev[catKey] ?? []).map((e) => e.item.id))
      const additions = items
        .filter((it) => !existingIds.has(it.id))
        .map<CatEntry>((it) => ({
          item: it,
          variantIndex: 0,
          loraModel: it.lora_name ? it.lora_model_strength ?? 1.0 : null,
          loraClip: it.lora_clip_strength ?? null,
        }))
      return { ...prev, [catKey]: [...(prev[catKey] ?? []), ...additions] }
    })
    items.forEach((it) => api.touchItem(it.id).catch(() => {}))
  }

  function removeItem(catKey: string, itemId: number) {
    setSelections((prev) => ({ ...prev, [catKey]: (prev[catKey] ?? []).filter((e) => e.item.id !== itemId) }))
  }

  function selectVariant(catKey: string, itemId: number, index: number) {
    setSelections((prev) => ({
      ...prev,
      [catKey]: (prev[catKey] ?? []).map((e) => (e.item.id === itemId ? { ...e, variantIndex: index } : e)),
    }))
  }

  function updateLoraStrength(catKey: string, itemId: number, field: 'model' | 'clip', value: number) {
    setSelections((prev) => ({
      ...prev,
      [catKey]: (prev[catKey] ?? []).map((e) =>
        e.item.id === itemId ? { ...e, loraModel: field === 'model' ? value : e.loraModel, loraClip: field === 'clip' ? value : e.loraClip } : e,
      ),
    }))
  }

  async function randomAdd(cat: Category) {
    const poolItems = await api.listItems({ pool: cat.pool })
    const existingIds = new Set(entriesFor(cat.key).map((e) => e.item.id))
    const candidates = poolItems.filter((it) => !existingIds.has(it.id))
    if (candidates.length === 0) return
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    addItems(cat.key, [pick])
  }

  async function onPickerConfirm(catKey: string, ids: number[]) {
    setPickerCategory(null)
    const items = await Promise.all(ids.map((id) => api.getItem(id)))
    addItems(catKey, items)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allEntries = useMemo(() => CATEGORIES.flatMap((cat) => entriesFor(cat.key)), [selections])

  const positive = useMemo(() => {
    const groupTexts = CATEGORIES.map((cat) =>
      entriesFor(cat.key)
        .map((e) => (e.item.variants[e.variantIndex]?.variant_text ?? e.item.positive).trim())
        .filter(Boolean)
        .join(', '),
    ).filter(Boolean)
    let text = [ZZSTYLE, ...groupTexts, QUALITY_TAGS].filter(Boolean).join(', ')
    for (const e of allEntries) {
      if (e.item.lora_name) text = upsertLoraTag(text, e.item.lora_name, e.loraModel ?? 1.0, e.loraClip)
    }
    return text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections])

  const negative = useMemo(() => {
    const seen = new Set<string>()
    const parts: string[] = []
    for (const e of allEntries) {
      const t = e.item.negative.trim()
      if (t && !seen.has(t)) {
        seen.add(t)
        parts.push(t)
      }
    }
    if (includeStandardNegative) parts.push(STANDARD_NEGATIVE)
    return parts.join(', ')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, includeStandardNegative])

  function copy(text: string) {
    navigator.clipboard?.writeText(text)
  }

  function clearAll() {
    setSelections({})
  }

  const pickerCat = CATEGORIES.find((c) => c.key === pickerCategory) ?? null

  return (
    <div className="flex-1 flex h-full w-full">
      {/* 左: カテゴリ別選択 */}
      <div className="flex-1 min-w-[340px] flex flex-col bg-bg-base p-4 overflow-hidden">
        <div className="flex justify-between items-center mb-3 shrink-0">
          <h1 className="text-xl font-medium text-text-main">簡易プロンプト作成</h1>
          <button onClick={clearAll} className="text-xs text-text-sub hover:text-red-400 transition-colors flex items-center gap-1">
            <IconTrash width={11} height={11} /> クリア
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {CATEGORIES.map((cat) => {
            const ents = entriesFor(cat.key)
            return (
              <div key={cat.key} className="bg-bg-panel border border-border-dark rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-text-main">
                    {cat.label} <span className="text-[10px] text-text-sub">({ents.length})</span>
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => randomAdd(cat)}
                      title="ランダムに追加"
                      className="w-6 h-6 flex items-center justify-center bg-bg-base border border-border-dark hover:border-accent hover:text-accent rounded transition-colors"
                    >
                      <IconDice width={12} height={12} />
                    </button>
                    <button
                      onClick={() => setPickerCategory(cat.key)}
                      title="アイテムを追加"
                      className="w-6 h-6 flex items-center justify-center bg-bg-base border border-border-dark hover:border-accent hover:text-accent rounded transition-colors"
                    >
                      <IconPlus width={12} height={12} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ents.map((e) => (
                    <span
                      key={e.item.id}
                      className="inline-flex items-center gap-1.5 px-2 py-1 bg-bg-base border border-border-dark rounded-md text-xs text-text-main hover:border-accent transition-colors"
                    >
                      {e.item.variants.length > 1 ? (
                        <select
                          value={e.variantIndex}
                          onChange={(ev) => selectVariant(cat.key, e.item.id, Number(ev.target.value))}
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
                      <button onClick={() => removeItem(cat.key, e.item.id)} className="text-text-sub hover:text-red-400 focus:outline-none">
                        <IconX width={11} height={11} />
                      </button>
                    </span>
                  ))}
                  {ents.length === 0 && <span className="text-text-sub text-xs">未選択</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 右: プレビュー */}
      <div className="w-[360px] min-w-[300px] bg-bg-panel border-l border-border-dark flex flex-col p-4 overflow-y-auto shrink-0">
        {allEntries.some((e) => e.item.lora_name) && (
          <div className="mb-4 bg-bg-base p-3 rounded-md border border-border-dark shadow-inner">
            <div className="text-xs text-text-sub border-b border-border-dark pb-1.5 mb-2 flex items-center gap-1">
              <span className="text-purple-400">◆</span> 使用中のLoRA
            </div>
            <div className="space-y-2">
              {CATEGORIES.map((cat) =>
                entriesFor(cat.key)
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
                        onChange={(ev) => updateLoraStrength(cat.key, e.item.id, 'model', parseFloat(ev.target.value))}
                        className="w-16 accent-accent cursor-pointer"
                      />
                      <input
                        type="number"
                        value={e.loraModel ?? 1}
                        step={0.1}
                        onChange={(ev) => updateLoraStrength(cat.key, e.item.id, 'model', parseFloat(ev.target.value) || 0)}
                        className="w-12 bg-bg-panel border border-border-dark text-xs px-1 py-0.5 rounded text-center focus:outline-none focus:border-accent"
                      />
                    </div>
                  )),
              )}
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
              readOnly
              value={positive}
              className="flex-1 w-full bg-bg-base border border-border-dark rounded-md p-2 text-text-main text-sm resize-none shadow-inner leading-relaxed"
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
              readOnly
              value={negative}
              className="flex-1 w-full bg-bg-base border border-border-dark rounded-md p-2 text-text-sub text-sm resize-none shadow-inner leading-relaxed"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 mt-3 text-xs text-text-sub cursor-pointer">
          <input type="checkbox" checked={includeStandardNegative} onChange={(e) => setIncludeStandardNegative(e.target.checked)} className="accent-accent" />
          標準ネガを含める
        </label>
      </div>

      {pickerCat && (
        <ItemPickerModal
          title={`${pickerCat.label}を追加`}
          pools={pools}
          defaultPool={pickerCat.pool}
          lockPool
          excludeItemIds={entriesFor(pickerCat.key).map((e) => e.item.id)}
          onClose={() => setPickerCategory(null)}
          onConfirm={(ids) => onPickerConfirm(pickerCat.key, ids)}
        />
      )}
    </div>
  )
}
