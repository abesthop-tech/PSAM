import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { IconDatabase, IconLayers, IconSettings, IconShapes, IconSparkles, IconWand } from './components/Icons'
import { api } from './api/client'
import PromptBuilder from './screens/PromptBuilder'
import GroupManager from './screens/GroupManager'
import ItemsManager from './screens/ItemsManager'
import DatabaseViewer from './screens/DatabaseViewer'
import QuickBuild from './screens/QuickBuild'
import ComfySend from './screens/ComfySend'
import ShortcutSettingsModal from './components/ShortcutSettingsModal'

const NAV_ITEMS = [
  { to: '/', label: '作成', icon: IconWand, end: true },
  { to: '/comfy', label: 'ComfyUI', icon: IconSparkles, end: false },
  { to: '/quick-build', label: 'クイック', icon: IconSparkles, end: false },
  { to: '/groups', label: 'グループ', icon: IconLayers, end: false },
  { to: '/items', label: 'アイテム', icon: IconShapes, end: false },
  { to: '/database', label: 'DB', icon: IconDatabase, end: false },
]

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [comfyConnected, setComfyConnected] = useState<boolean | null>(null)

  useEffect(() => {
    // Startup-only check. The ComfyUI screen checks again when it opens.
    api.comfyStatus().then(() => setComfyConnected(true)).catch(() => setComfyConnected(false))
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden bg-bg-base text-text-main font-sans flex select-none">
      <nav className="w-20 bg-bg-panel border-r border-border-dark flex flex-col items-center py-6 shrink-0 z-20">
        <div className="text-accent text-2xl mb-8">✎</div>
        <div className="flex flex-col gap-4 w-full">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `w-full flex flex-col items-center py-3 border-l-2 transition-colors ${
                  isActive
                    ? 'text-accent border-accent bg-bg-card'
                    : 'text-text-sub border-transparent hover:text-text-main hover:bg-bg-base'
                }`
              }
            >
              <Icon className="mb-1" width={20} height={20} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
        <div className="mt-auto w-full">
          <div title={comfyConnected === true ? 'ComfyUI 接続済み' : comfyConnected === false ? 'ComfyUI 未接続' : 'ComfyUI 接続を未確認'} className="mb-1 flex justify-center">
            <span className={`h-2 w-2 rounded-full ${comfyConnected === true ? 'bg-emerald-400' : comfyConnected === false ? 'bg-red-500' : 'bg-zinc-600'}`} />
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            title="ショートカットキー設定"
            className="w-full flex flex-col items-center py-3 text-text-sub hover:text-text-main transition-colors"
          >
            <IconSettings width={18} height={18} />
          </button>
        </div>
      </nav>

      <main className="flex-1 relative overflow-hidden flex text-sm">
        <Routes>
          <Route path="/" element={<PromptBuilder />} />
          <Route path="/comfy" element={<ComfySend />} />
          <Route path="/quick-build" element={<QuickBuild />} />
          <Route path="/groups" element={<GroupManager />} />
          <Route path="/items" element={<ItemsManager />} />
          <Route path="/database" element={<DatabaseViewer />} />
        </Routes>
      </main>

      {settingsOpen && <ShortcutSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

export default App
