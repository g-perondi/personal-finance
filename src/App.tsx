import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { AccountPage } from './pages/AccountPage'
import { CategoryPage } from './pages/CategoryPage'
import { DashboardPage } from './pages/DashboardPage'
import { DocumentPage } from './pages/DocumentPage'
import { SettingsPage } from './pages/SettingsPage'
import { TransactionPage } from './pages/TransactionPage'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionPage />} />
        <Route path="accounts" element={<AccountPage />} />
        <Route path="categories" element={<CategoryPage />} />
        <Route path="documents" element={<DocumentPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
