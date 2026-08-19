import { useState } from 'react'
import { SHORTCUT_ACTIONS, formatBinding, getBinding, keyEventToBinding, resetBinding, setBinding } from '../hooks/useShortcuts'
import { IconX } from './Icons'

interface Props {
  onClose: () => void
}

export default function ShortcutSettingsModal({ onClose }: Props) {
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [, forceRerender] = useState(0)

  function startRecording(id: string) {
    setRecordingId(id)
  }

  function onRecordKeyDown(id: string, e: React.KeyboardEvent) {
    e.preventDefault()
    if (e.key === 'Escape') {
      setRecordingId(null)
      return
    }
    const binding = keyEventToBinding(e)
    if (!binding || ['ctrl', 'shift', 'alt'].includes(binding)) return
    setBinding(id, binding)
    setRecordingId(null)
    forceRerender((n) => n + 1)
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-100 flex items-center justify-center">
      <div className="bg-bg-panel rounded-xl border border-border-dark w-[480px] max-w-[95vw] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border-dark">
          <h3 className="text-lg font-medium">ショートカットキー設定</h3>
          <button onClick={onClose} className="text-text-sub hover:text-white w-8 h-8 flex justify-center items-center rounded-full hover:bg-bg-card">
            <IconX />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {SHORTCUT_ACTIONS.map((action) => (
            <div key={action.id} className="flex items-center justify-between gap-3 p-3 bg-bg-base border border-border-dark rounded-md">
              <span className="text-sm flex-1">{action.label}</span>
              {recordingId === action.id ? (
                <input
                  autoFocus
                  readOnly
                  value="キーを入力..."
                  onKeyDown={(e) => onRecordKeyDown(action.id, e)}
                  onBlur={() => setRecordingId(null)}
                  className="w-32 text-center bg-bg-panel border border-accent rounded px-2 py-1 text-xs text-accent focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => startRecording(action.id)}
                  className="w-32 text-center px-2 py-1 bg-bg-panel border border-border-dark hover:border-accent hover:text-accent rounded text-xs transition-colors"
                >
                  {formatBinding(getBinding(action.id))}
                </button>
              )}
              <button
                onClick={() => {
                  resetBinding(action.id)
                  forceRerender((n) => n + 1)
                }}
                className="text-[10px] text-text-sub hover:text-text-main"
              >
                初期値に戻す
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
