import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { Group, Item, ItemDetail, ItemType, Pool, Variant } from '../types'
import { IconImage, IconPlus, IconTrash, IconUpload, IconX } from './Icons'
import ItemPickerModal from './ItemPickerModal'
import Resizer from './Resizer'

interface Props {
  itemId: number | null
  initialPool: string
  pools: Pool[]
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}

interface Draft {
  pool: string
  type: ItemType
  name: string
  positive: string
  negative: string
  lora_name: string
  lora_model_strength: number
  lora_clip_strength: number
  same_as_model: boolean
  image_path: string
  memo: string
}

function emptyDraft(pool: string): Draft {
  return {
    pool,
    type: 'part',
    name: '',
    positive: '',
    negative: '',
    lora_name: '',
    lora_model_strength: 0.8,
    lora_clip_strength: 0.8,
    same_as_model: true,
    image_path: '',
    memo: '',
  }
}

function draftFromItem(item: ItemDetail): Draft {
  return {
    pool: item.pool,
    type: item.type,
    name: item.name,
    positive: item.positive,
    negative: item.negative,
    lora_name: item.lora_name ?? '',
    lora_model_strength: item.lora_model_strength ?? 0.8,
    lora_clip_strength: item.lora_clip_strength ?? item.lora_model_strength ?? 0.8,
    same_as_model: item.lora_clip_strength === null || item.lora_clip_strength === item.lora_model_strength,
    image_path: item.image_path ?? '',
    memo: item.memo ?? '',
  }
}

export default function ItemEditPanel({ itemId, initialPool, pools, onClose, onSaved, onDeleted }: Props) {
  const [currentId, setCurrentId] = useState<number | null>(itemId)
  const [draft, setDraft] = useState<Draft>(emptyDraft(initialPool))
  const [variants, setVariants] = useState<Variant[]>([])
  const [newVariantText, setNewVariantText] = useState('')
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [pendingGroupIds, setPendingGroupIds] = useState<number[]>([])
  const [pendingLinkItems, setPendingLinkItems] = useState<Item[]>([])
  const [allPoolGroups, setAllPoolGroups] = useState<Group[]>([])
  const [addGroupSelect, setAddGroupSelect] = useState('')
  const [linkedItems, setLinkedItems] = useState<Item[]>([])
  const [tab, setTab] = useState<'basic' | 'groups' | 'links'>('basic')
  const [linkPickerOpen, setLinkPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [panelWidth, setPanelWidth] = useState(450)
  const initialDraftRef = useRef<string>('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  const isNew = currentId === null

  useEffect(() => {
    setCurrentId(itemId)
  }, [itemId])

  function resetForNewItem() {
    const d = emptyDraft(initialPool)
    setDraft(d)
    initialDraftRef.current = JSON.stringify(d)
    setVariants([])
    setGroupIds([])
    setPendingGroupIds([])
    setLinkedItems([])
    setPendingLinkItems([])
  }

  useEffect(() => {
    if (currentId === null) {
      resetForNewItem()
      return
    }
    api.getItem(currentId).then((detail) => {
      const d = draftFromItem(detail)
      setDraft(d)
      initialDraftRef.current = JSON.stringify(d)
      setVariants(detail.variants)
      setGroupIds(detail.group_ids)
      Promise.all(detail.linked_item_ids.map((id) => api.getItem(id).catch(() => null))).then((items) =>
        setLinkedItems(items.filter((x): x is ItemDetail => !!x)),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, initialPool])

  useEffect(() => {
    if (!draft.pool) return
    api.listGroups({ pool: draft.pool }).then(setAllPoolGroups)
  }, [draft.pool])

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!draft.name.trim()) {
      alert('Nameを入力してください')
      return
    }
    setSaving(true)
    try {
      const payload = {
        pool: draft.pool,
        type: draft.type,
        name: draft.name.trim(),
        positive: draft.positive,
        negative: draft.negative,
        lora_name: draft.lora_name.trim() || null,
        lora_model_strength: draft.lora_name.trim() ? draft.lora_model_strength : null,
        lora_clip_strength: draft.lora_name.trim() ? (draft.same_as_model ? null : draft.lora_clip_strength) : null,
        image_path: draft.image_path.trim() || null,
        memo: draft.memo.trim() || null,
      }
      if (isNew) {
        const created = await api.createItem({
          ...payload,
          variants: variants.map((v) => ({ variant_text: v.variant_text, sort_order: v.sort_order })),
          group_ids: pendingGroupIds,
        })
        if (pendingLinkItems.length > 0) {
          await Promise.all(pendingLinkItems.map((it) => api.addLink(created.id, it.id)))
        }
        resetForNewItem()
        nameInputRef.current?.focus()
      } else {
        await api.updateItem(currentId!, payload)
        initialDraftRef.current = JSON.stringify(draft)
      }
      setSavedMessage(true)
      setTimeout(() => setSavedMessage(false), 2000)
      onSaved()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (JSON.stringify(draft) !== initialDraftRef.current) {
      if (!confirm('保存されていない変更があります。破棄して閉じますか?')) return
    }
    onClose()
  }

  async function addVariant() {
    if (!newVariantText.trim()) return
    if (isNew) {
      setVariants((prev) => [...prev, { id: -Date.now(), item_id: -1, variant_text: newVariantText.trim(), sort_order: prev.length }])
      setNewVariantText('')
      return
    }
    const v = await api.addVariant(currentId!, newVariantText.trim(), variants.length)
    setVariants((prev) => [...prev, v])
    setNewVariantText('')
  }

  async function updateVariantText(v: Variant, text: string) {
    setVariants((prev) => prev.map((x) => (x.id === v.id ? { ...x, variant_text: text } : x)))
    if (!isNew) await api.updateVariant(currentId!, v.id, text, v.sort_order)
  }

  async function removeVariant(v: Variant) {
    if (variants.length <= 1) {
      alert('アイテムは最低1つのバリエーションが必要です')
      return
    }
    if (!isNew) await api.deleteVariant(currentId!, v.id)
    setVariants((prev) => prev.filter((x) => x.id !== v.id))
  }

  async function addToGroup() {
    if (!addGroupSelect) return
    const gid = Number(addGroupSelect)
    if (isNew) {
      setPendingGroupIds((prev) => [...prev, gid])
    } else if (currentId) {
      await api.addItemToGroup(currentId, gid)
      setGroupIds((prev) => [...prev, gid])
    }
    setAddGroupSelect('')
  }

  async function removeFromGroup(groupId: number) {
    if (isNew) {
      setPendingGroupIds((prev) => prev.filter((id) => id !== groupId))
      return
    }
    if (!currentId) return
    await api.removeItemFromGroup(currentId, groupId)
    setGroupIds((prev) => prev.filter((id) => id !== groupId))
  }

  async function addLinks(ids: number[]) {
    if (isNew) {
      const items = await Promise.all(ids.map((id) => api.getItem(id)))
      setPendingLinkItems((prev) => [...prev, ...items])
      setLinkPickerOpen(false)
      return
    }
    if (!currentId) return
    await Promise.all(ids.map((id) => api.addLink(currentId, id)))
    const items = await Promise.all(ids.map((id) => api.getItem(id)))
    setLinkedItems((prev) => [...prev, ...items])
    setLinkPickerOpen(false)
  }

  async function removeLink(otherId: number) {
    if (isNew) {
      setPendingLinkItems((prev) => prev.filter((it) => it.id !== otherId))
      return
    }
    if (!currentId) return
    await api.removeLink(currentId, otherId)
    setLinkedItems((prev) => prev.filter((it) => it.id !== otherId))
  }

  async function handleImageUpload(file: File | undefined) {
    if (!file || !currentId) return
    setUploading(true)
    try {
      const updated = await api.uploadItemImage(currentId, file)
      update('image_path', updated.image_path ?? '')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!currentId) return
    if (!confirm(`「${draft.name}」を削除しますか?この操作は取り消せません`)) return
    await api.deleteItem(currentId)
    onDeleted?.()
  }

  return (
    <>
      <div className="absolute top-0 bottom-0 flex z-40" style={{ right: panelWidth }}>
        <Resizer onDelta={(d) => setPanelWidth((w) => Math.max(360, Math.min(800, w - d)))} />
      </div>
      <div
        style={{ width: panelWidth }}
        className="absolute right-0 top-0 bottom-0 bg-bg-panel border-l border-border-dark shadow-2xl flex flex-col z-30"
      >
        <div className="p-4 border-b border-border-dark flex justify-between items-center bg-bg-card">
          <h3 className="font-medium text-lg">{isNew ? '新規アイテム' : 'アイテム編集'}</h3>
          <button onClick={handleClose} className="text-text-sub hover:text-text-main">
            <IconX width={18} height={18} />
          </button>
        </div>

        <div className="flex border-b border-border-dark bg-bg-base">
          {(['basic', 'groups', 'links'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm border-b-2 transition-colors ${
                tab === t ? 'text-accent border-accent font-medium bg-bg-panel' : 'text-text-sub border-transparent hover:text-text-main'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {t === 'basic' ? '基本情報' : t === 'groups' ? '所属G' : '関連付け'}
            </button>
          ))}
        </div>

        {tab === 'basic' && (
          <div className="flex-1 p-5 overflow-y-auto space-y-5">
            <div className="flex gap-4">
              <label
                className={`w-24 h-24 bg-bg-base border border-dashed border-border-dark rounded flex flex-col items-center justify-center text-text-sub shrink-0 overflow-hidden relative ${
                  isNew ? '' : 'cursor-pointer hover:border-accent'
                }`}
                title={isNew ? 'アイテムを追加してから画像をアップロードできます' : '画像をアップロード'}
              >
                {draft.image_path ? <img src={draft.image_path} className="w-full h-full object-cover" /> : <IconImage width={24} height={24} />}
                {!isNew && (
                  <>
                    <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                      {uploading ? <span className="text-[10px] text-white">アップロード中...</span> : <IconUpload width={18} height={18} className="text-white" />}
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => handleImageUpload(e.target.files?.[0])}
                      className="hidden"
                    />
                  </>
                )}
              </label>
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-xs text-text-sub mb-1">Name</label>
                  <input
                    ref={nameInputRef}
                    autoFocus={isNew}
                    value={draft.name}
                    onChange={(e) => update('name', e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    className="w-full bg-bg-base border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-text-sub mb-1">Pool</label>
                    <select
                      value={draft.pool}
                      onChange={(e) => update('pool', e.target.value)}
                      className="w-full bg-bg-base border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                    >
                      {pools.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-text-sub mb-1">Type</label>
                    <select
                      value={draft.type}
                      onChange={(e) => update('type', e.target.value as ItemType)}
                      className="w-full bg-bg-base border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="finished">Finished</option>
                      <option value="part">Part</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-sub mb-1">Positiveプロンプト</label>
              <textarea
                value={draft.positive}
                onChange={(e) => update('positive', e.target.value)}
                className="w-full h-20 bg-bg-base border border-border-dark rounded p-2 text-sm focus:outline-none focus:border-accent resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-text-sub mb-1">Negativeプロンプト</label>
              <textarea
                value={draft.negative}
                onChange={(e) => update('negative', e.target.value)}
                className="w-full h-12 bg-bg-base border border-border-dark rounded p-2 text-sm focus:outline-none focus:border-accent resize-none"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-text-sub">Variants</label>
                <span className="text-[10px] text-text-sub">最低1つ必要</span>
              </div>
              <div className="space-y-1.5">
                {variants.map((v) => (
                  <div key={v.id} className="flex gap-1.5">
                    <input
                      value={v.variant_text}
                      onChange={(e) => updateVariantText(v, e.target.value)}
                      className="flex-1 bg-bg-base border border-border-dark rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
                    />
                    <button onClick={() => removeVariant(v)} className="text-text-sub hover:text-red-400 px-1">
                      <IconTrash width={12} height={12} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <input
                    value={newVariantText}
                    onChange={(e) => setNewVariantText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addVariant()}
                    placeholder="新規バリエーションを追加..."
                    className="flex-1 bg-bg-base border border-dashed border-border-dark rounded px-2 py-1 text-xs focus:outline-none focus:border-accent placeholder-text-sub"
                  />
                  <button onClick={addVariant} className="text-accent hover:text-accent-hover px-1">
                    <IconPlus width={12} height={12} />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-bg-base border border-border-dark rounded-md">
              <div className="text-xs text-purple-400 font-medium mb-3 flex items-center gap-1">◆ Associated LoRA</div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-text-sub mb-1">LoRA Name</label>
                  <input
                    value={draft.lora_name}
                    onChange={(e) => update('lora_name', e.target.value)}
                    placeholder="例: character_v1.safetensors"
                    className="w-full bg-bg-panel border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent placeholder-text-sub"
                  />
                </div>
                {draft.lora_name.trim() && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-[10px] text-text-sub mb-1">Model Strength</label>
                      <input
                        type="number"
                        step={0.1}
                        value={draft.lora_model_strength}
                        onChange={(e) => update('lora_model_strength', parseFloat(e.target.value) || 0)}
                        className="w-full bg-bg-panel border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-end mb-1">
                        <label className="block text-[10px] text-text-sub">Clip Strength</label>
                        <label className="flex items-center gap-1 text-[10px] text-text-main cursor-pointer">
                          <input type="checkbox" checked={draft.same_as_model} onChange={(e) => update('same_as_model', e.target.checked)} className="accent-accent" />
                          Same as Model
                        </label>
                      </div>
                      <input
                        type="number"
                        step={0.1}
                        disabled={draft.same_as_model}
                        value={draft.same_as_model ? draft.lora_model_strength : draft.lora_clip_strength}
                        onChange={(e) => update('lora_clip_strength', parseFloat(e.target.value) || 0)}
                        className="w-full bg-bg-panel border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-sub mb-1">Image path (相対パス・任意)</label>
              <input
                value={draft.image_path}
                onChange={(e) => update('image_path', e.target.value)}
                placeholder="例: images/character/foo.png"
                className="w-full bg-bg-base border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent placeholder-text-sub"
              />
            </div>
            <div>
              <label className="block text-xs text-text-sub mb-1">Memo</label>
              <textarea
                value={draft.memo}
                onChange={(e) => update('memo', e.target.value)}
                className="w-full h-12 bg-bg-base border border-border-dark rounded p-2 text-sm focus:outline-none focus:border-accent resize-none"
              />
            </div>

            {!isNew && (
              <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                <IconTrash width={11} height={11} /> このアイテムを削除
              </button>
            )}
          </div>
        )}

        {tab === 'groups' && (
          <div className="flex-1 p-5 overflow-y-auto">
            {isNew && <div className="text-[11px] text-text-sub mb-3">※ 保存ボタンを押すと確定します</div>}
            <div className="text-sm text-text-sub mb-3">所属しているグループ</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {(isNew ? pendingGroupIds : groupIds).map((gid) => {
                const g = allPoolGroups.find((x) => x.id === gid)
                return (
                  <span key={gid} className="px-3 py-1.5 bg-bg-base border border-border-dark rounded text-xs text-text-main flex items-center gap-2 group hover:border-accent transition-colors">
                    {g?.name ?? `#${gid}`}
                    <button onClick={() => removeFromGroup(gid)} className="text-text-sub hover:text-red-400">
                      <IconX width={11} height={11} />
                    </button>
                  </span>
                )
              })}
              {(isNew ? pendingGroupIds : groupIds).length === 0 && <span className="text-text-sub text-xs">所属グループなし</span>}
            </div>
            <div className="flex gap-2">
              <select
                value={addGroupSelect}
                onChange={(e) => setAddGroupSelect(e.target.value)}
                className="flex-1 bg-bg-base border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
              >
                <option value="">グループを選択...</option>
                {allPoolGroups
                  .filter((g) => !(isNew ? pendingGroupIds : groupIds).includes(g.id))
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
              <button onClick={addToGroup} disabled={!addGroupSelect} className="px-3 py-1.5 bg-bg-base border border-border-dark hover:border-accent hover:text-accent rounded text-xs disabled:opacity-40">
                追加
              </button>
            </div>
          </div>
        )}

        {tab === 'links' && (
          <div className="flex-1 p-5 overflow-y-auto">
            {isNew && <div className="text-[11px] text-text-sub mb-3">※ 保存ボタンを押すと確定します</div>}
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-text-sub">関連付けられたアイテム</span>
              <button onClick={() => setLinkPickerOpen(true)} className="px-3 py-1.5 bg-bg-base border border-border-dark hover:border-accent hover:text-accent rounded text-xs transition-colors flex items-center gap-1">
                <IconPlus width={11} height={11} /> 関連追加
              </button>
            </div>
            <div className="space-y-2">
              {(isNew ? pendingLinkItems : linkedItems).map((it) => (
                <div key={it.id} className="flex justify-between items-center p-2.5 bg-bg-base border border-border-dark rounded group hover:border-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-bg-panel rounded flex justify-center items-center shrink-0">
                      <IconImage width={11} height={11} />
                    </div>
                    <span className="text-sm">
                      {it.name} <span className="text-text-sub text-xs">({pools.find((p) => p.key === it.pool)?.display_name ?? it.pool})</span>
                    </span>
                  </div>
                  <button onClick={() => removeLink(it.id)} className="text-text-sub hover:text-red-400">
                    <IconX width={13} height={13} />
                  </button>
                </div>
              ))}
              {(isNew ? pendingLinkItems : linkedItems).length === 0 && <div className="text-text-sub text-xs">関連付けはありません</div>}
            </div>
          </div>
        )}

        <div className="p-4 border-t border-border-dark bg-bg-panel flex justify-end items-center gap-3 shrink-0">
          {savedMessage && <span className="text-xs text-accent mr-auto">保存しました</span>}
          <button onClick={handleClose} className="px-4 py-2 rounded text-sm text-text-main bg-bg-card border border-border-dark hover:bg-[#333] transition-colors">
            閉じる
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded text-sm text-white bg-accent hover:bg-accent-hover transition-colors font-medium disabled:opacity-50"
          >
            {isNew ? '追加' : '更新'}
          </button>
        </div>
      </div>

      {linkPickerOpen && (
        <ItemPickerModal
          title="関連付けるアイテムを選択"
          pools={pools}
          excludeItemIds={isNew ? pendingLinkItems.map((it) => it.id) : [currentId!, ...linkedItems.map((it) => it.id)]}
          onClose={() => setLinkPickerOpen(false)}
          onConfirm={addLinks}
        />
      )}
    </>
  )
}
