import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { PromptSet, PromptSetEntry } from '../types'
import { IconTrash, IconX } from './Icons'

interface Props {
  itemCount: number
  positive: string
  negative: string
  entries: PromptSetEntry[]
  onClose: () => void
  onLoad: (set: PromptSet) => void
}

export default function PromptSetModal({ itemCount, positive, negative, entries, onClose, onLoad }: Props) {
  const [sets, setSets] = useState<PromptSet[]>([])
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [saveItems, setSaveItems] = useState(true)
  const [savePrompts, setSavePrompts] = useState(true)
  const [saving, setSaving] = useState(false)

  const refresh = () => api.listPromptSets().then(setSets)
  useEffect(() => { refresh() }, [])

  async function save() {
    if (!name.trim()) return
    if (sets.some((s) => s.name === name.trim()) && !window.confirm('同名のセットを上書きしますか？')) return
    setSaving(true)
    try {
      await api.savePromptSet({
        name: name.trim(), memo: memo.trim(),
        positive: savePrompts ? positive : '', negative: savePrompts ? negative : '',
        entries: saveItems ? entries : [],
      })
      setName('')
      setMemo('')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    if (!window.confirm('このプロンプトセットを削除しますか？')) return
    await api.deletePromptSet(id)
    refresh()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onMouseDown={onClose}>
      <div className="w-full max-w-3xl max-h-[85vh] bg-bg-panel border border-border-dark rounded-lg shadow-2xl flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border-dark flex justify-between items-center">
          <h2 className="text-lg font-medium">プロンプトセット</h2>
          <button onClick={onClose} className="text-text-sub hover:text-text-main"><IconX /></button>
        </div>
        <div className="grid grid-cols-2 min-h-0 flex-1">
          <div className="p-4 border-r border-border-dark overflow-y-auto">
            <h3 className="text-sm font-medium mb-3">現在の作業を保存</h3>
            <label className="text-xs text-text-sub">セット名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 mb-3 bg-bg-base border border-border-dark rounded px-3 py-2 focus:outline-none focus:border-accent" />
            <label className="text-xs text-text-sub">メモ（任意）</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full mt-1 mb-3 h-16 bg-bg-base border border-border-dark rounded px-3 py-2 resize-none focus:outline-none focus:border-accent" />
            <div className="bg-bg-base border border-border-dark rounded p-3 text-xs space-y-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={saveItems} onChange={(e) => setSaveItems(e.target.checked)} className="accent-accent" />アイテム・バリエーション・LoRA強度を保存（{itemCount}件）</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={savePrompts} onChange={(e) => setSavePrompts(e.target.checked)} className="accent-accent" />手動編集を含むプロンプト文字列を保存</label>
              {savePrompts && <div className="text-text-sub pt-1 line-clamp-3">Positive: {positive || '（空）'}<br />Negative: {negative || '（空）'}</div>}
            </div>
            <button onClick={save} disabled={!name.trim() || saving} className="w-full mt-4 py-2 bg-accent hover:bg-accent-hover text-white rounded disabled:opacity-40">保存</button>
          </div>
          <div className="p-4 overflow-y-auto">
            <h3 className="text-sm font-medium mb-3">保存済みセットを読み込む</h3>
            <p className="text-xs text-text-sub mb-3">読み込むと現在の作業内容を置き換えます。</p>
            <div className="space-y-2">
              {sets.map((set) => (
                <div key={set.id} className="bg-bg-base border border-border-dark rounded p-3 flex gap-2 items-start">
                  <button onClick={() => { if (window.confirm('現在の作業内容を置き換えますか？')) onLoad(set) }} className="flex-1 text-left min-w-0">
                    <div className="font-medium truncate">{set.name}</div>
                    <div className="text-[10px] text-text-sub mt-1">{set.entries.length}件・{new Date(set.updated_at).toLocaleString()}</div>
                    {set.memo && <div className="text-xs text-text-sub mt-1 truncate">{set.memo}</div>}
                  </button>
                  <button onClick={() => remove(set.id)} className="text-text-sub hover:text-red-400"><IconTrash width={13} height={13} /></button>
                </div>
              ))}
              {sets.length === 0 && <div className="text-xs text-text-sub">保存済みセットはありません</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
