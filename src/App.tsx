import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { FeatureEnabledRoute } from './components/FeatureEnabledRoute'

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)
const TransactionPage = lazy(() =>
  import('./pages/TransactionPage').then((module) => ({
    default: module.TransactionPage,
  })),
)
const InvestmentPage = lazy(() =>
  import('./pages/InvestmentPage').then((module) => ({
    default: module.InvestmentPage,
  })),
)
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })),
)
const CategoryPage = lazy(() =>
  import('./pages/CategoryPage').then((module) => ({ default: module.CategoryPage })),
)
const DocumentPage = lazy(() =>
  import('./pages/DocumentPage').then((module) => ({ default: module.DocumentPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)

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
