import { BarChart3, FileUp, Home, Settings, ShoppingBag, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

type NavigationItem = { label: string; path: string; icon: LucideIcon }

const navigationItems: NavigationItem[] = [
  { label: 'Today', path: '/today', icon: Home },
  { label: 'Import', path: '/import', icon: FileUp },
  { label: 'Orders', path: '/orders', icon: ShoppingBag },
  { label: 'Customers', path: '/customers', icon: Users },
  { label: 'Insights', path: '/insights', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Settings },
]

export function AppShell() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl bg-[#FBF3D5] shadow-[0_0_0_1px_rgba(79,116,200,0.08)]">
      <main className="min-h-dvh px-5 pb-[calc(7.25rem+env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <Outlet />
      </main>
      <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-3xl border-t border-[#4F74C8]/20 bg-[#FBF3D5]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <ul className="grid grid-cols-6 gap-0.5" role="list">
          {navigationItems.map(({ label, path, icon: Icon }) => (
            <li key={path}>
              <NavLink
                to={path}
                className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F74C8] ${isActive ? 'bg-[#4F74C8] text-white' : 'text-[#4A5365] hover:bg-[#4F74C8]/10'}`}
              >
                <Icon aria-hidden="true" size={19} strokeWidth={2} />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
