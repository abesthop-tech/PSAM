import { useEffect } from 'react'

export interface ShortcutAction {
  id: string
  label: string
  defaultKey: string
}

// Extensible registry — add more entries here as more shortcuts are wired up.
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'editItem', label: 'アイテム編集を開く (Items Managerで1件選択時)', defaultKey: 'ctrl+e' },
]

const STORAGE_KEY = 'promptManager.shortcuts'

function loadOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function getBinding(actionId: string): string {
  const overrides = loadOverrides()
  const action = SHORTCUT_ACTIONS.find((a) => a.id === actionId)
  return overrides[actionId] ?? action?.defaultKey ?? ''
}

export function setBinding(actionId: string, key: string) {
  const overrides = loadOverrides()
  overrides[actionId] = key
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

export function resetBinding(actionId: string) {
  const overrides = loadOverrides()
  delete overrides[actionId]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

export function formatBinding(binding: string): string {
  if (!binding) return '(未設定)'
  return binding
    .split('+')
    .map((p) => (p === 'ctrl' ? 'Ctrl' : p === 'shift' ? 'Shift' : p === 'alt' ? 'Alt' : p.length === 1 ? p.toUpperCase() : p))
    .join('+')
}

export function keyEventToBinding(e: KeyboardEvent | React.KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  const key = e.key.toLowerCase()
  if (!['control', 'shift', 'alt', 'meta'].includes(key)) parts.push(key)
  return parts.join('+')
}

export function useShortcut(actionId: string, handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const binding = getBinding(actionId)
      if (!binding || keyEventToBinding(e) !== binding) return
      e.preventDefault()
      handler()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actionId, handler, enabled])
}
