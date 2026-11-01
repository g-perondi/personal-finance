import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { FeatureEnabledRoute } from './components/FeatureEnabledRoute'
import { AccountPage } from './pages/AccountPage'
import { CategoryPage } from './pages/CategoryPage'
import { DashboardPage } from './pages/DashboardPage'
import { DocumentPage } from './pages/DocumentPage'
import { InvestmentPage } from './pages/InvestmentPage'
import { SettingsPage } from './pages/SettingsPage'
import { TransactionPage } from './pages/TransactionPage'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionPage />} />
        <Route
          path="investments"
          element={
            <FeatureEnabledRoute feature="investments">
              <InvestmentPage />
            </FeatureEnabledRoute>
          }
        />
        <Route path="accounts" element={<AccountPage />} />
        <Route path="categories" element={<CategoryPage />} />
        <Route
          path="documents"
          element={
            <FeatureEnabledRoute feature="documents">
              <DocumentPage />
            </FeatureEnabledRoute>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
