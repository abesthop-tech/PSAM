import { NavLink, Route, Routes } from 'react-router-dom'
import { IconDatabase, IconLayers, IconShapes, IconWand } from './components/Icons'
import PromptBuilder from './screens/PromptBuilder'
import GroupManager from './screens/GroupManager'
import ItemsManager from './screens/ItemsManager'
import DatabaseViewer from './screens/DatabaseViewer'

const NAV_ITEMS = [
  { to: '/', label: 'Build', icon: IconWand, end: true },
  { to: '/groups', label: 'Groups', icon: IconLayers, end: false },
  { to: '/items', label: 'Items', icon: IconShapes, end: false },
  { to: '/database', label: 'Database', icon: IconDatabase, end: false },
]

function App() {
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
      </nav>

      <main className="flex-1 relative overflow-hidden flex text-sm">
        <Routes>
          <Route path="/" element={<PromptBuilder />} />
          <Route path="/groups" element={<GroupManager />} />
          <Route path="/items" element={<ItemsManager />} />
          <Route path="/database" element={<DatabaseViewer />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
