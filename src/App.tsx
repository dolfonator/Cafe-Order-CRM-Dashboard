import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DemoBanner } from './components/DemoBanner'
import { InstallPrompt } from './components/InstallPrompt'
import { AppShell } from './components/layout/AppShell'
import { AuthBoundary } from './features/auth/AuthBoundary'
import { isDemoMode } from './features/auth/supabaseAuth'
import { CustomersPage } from './pages/CustomersPage'
import { ImportPage } from './pages/ImportPage'
import { InsightsPage } from './pages/InsightsPage'
import { OrdersPage } from './pages/OrdersPage'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'

export default function App() {
  return (
    <AuthBoundary>
      {isDemoMode && <DemoBanner />}
      <div className={isDemoMode ? 'pt-9' : undefined}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/today" element={<TodayPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </div>
      <InstallPrompt />
    </AuthBoundary>
  )
}
