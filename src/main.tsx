import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { DbGate } from './components/DbGate.tsx'
import { DbProvider } from './context/DbProvider.tsx'
import { DashboardPeriodProvider } from './context/DashboardPeriodProvider.tsx'
import { AppSettingsProvider } from './context/AppSettingsProvider.tsx'
import './index.css'
import { installContextMenuBlock } from './lib/disable-context-menu.ts'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'

installContextMenuBlock()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <DbProvider>
        <DbGate>
          <BrowserRouter>
            <AppSettingsProvider>
              <DashboardPeriodProvider>
                <App />
              </DashboardPeriodProvider>
            </AppSettingsProvider>
          </BrowserRouter>
        </DbGate>
      </DbProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
