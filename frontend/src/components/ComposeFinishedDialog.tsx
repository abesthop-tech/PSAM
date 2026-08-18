import { useState } from 'react'
import { api } from '../api/client'
import type { Item, Pool } from '../types'
import { IconX } from './Icons'

interface Props {
  parts: Item[]
  pools: Pool[]
  onClose: () => void
  onCreated: () => void
}

export default function ComposeFinishedDialog({ parts, pools, onClose, onCreated }: Props) {
  const [pool, setPool] = useState(parts[0]?.pool ?? pools[0]?.key ?? '')
  const [name, setName] = useState('')
  const [separator, setSeparator] = useState(', ')
  const [negative, setNegative] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  const preview = parts.map((p) => p.positive.trim()).filter(Boolean).join(separator)

  async function submit() {
    if (!name.trim()) {
      alert('名前を入力してください')
      return
    }
    setSaving(true)
    try {
      await api.composeFinished({
        pool,
        name: name.trim(),
        part_item_ids: parts.map((p) => p.id),
        separator,
        negative,
        memo: memo.trim() || undefined,
      })
      onCreated()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-100 flex items-center justify-center">
      <div className="bg-bg-panel rounded-xl border border-border-dark w-[560px] max-w-[95vw] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border-dark">
          <h3 className="text-lg font-medium">選択から完成品を作成</h3>
          <button onClick={onClose} className="text-text-sub hover:text-white w-8 h-8 flex justify-center items-center rounded-full hover:bg-bg-card">
            <IconX />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-text-sub mb-1">元になるParts ({parts.length}件)</label>
            <div className="flex flex-wrap gap-1.5">
              {parts.map((p) => (
                <span key={p.id} className="px-2 py-1 bg-bg-base border border-border-dark rounded text-xs">
                  {p.name}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-text-sub mb-1">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-bg-base border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs text-text-sub mb-1">Pool</label>
              <select value={pool} onChange={(e) => setPool(e.target.value)} className="w-full bg-bg-base border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent">
                {pools.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-text-sub mb-1">結合プレビュー (Positive)</label>
              <div className="w-full bg-bg-base border border-border-dark rounded p-2 text-xs text-text-sub max-h-24 overflow-y-auto">{preview || '(空)'}</div>
            </div>
            <div className="w-20">
              <label className="block text-xs text-text-sub mb-1">区切り</label>
              <input value={separator} onChange={(e) => setSeparator(e.target.value)} className="w-full bg-bg-base border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-sub mb-1">Negative Prompt (任意)</label>
            <textarea value={negative} onChange={(e) => setNegative(e.target.value)} className="w-full h-14 bg-bg-base border border-border-dark rounded p-2 text-sm focus:outline-none focus:border-accent resize-none" />
          </div>
          <div>
            <label className="block text-xs text-text-sub mb-1">Memo (任意)</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full bg-bg-base border border-border-dark rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>

        <div className="p-4 border-t border-border-dark flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded text-sm text-text-main bg-bg-card border border-border-dark hover:bg-[#333] transition-colors">
            キャンセル
          </button>
          <button onClick={submit} disabled={saving} className="px-5 py-2 rounded text-sm text-white bg-accent hover:bg-accent-hover transition-colors font-medium disabled:opacity-50">
            作成する
          </button>
        </div>
      </div>
    </div>
  )
}
