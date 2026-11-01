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
import { ElectronWindowClose } from './components/ElectronWindowClose.tsx'
import { ElectronDesktopTitleBar } from './components/ElectronDesktopTitleBar.tsx'

installContextMenuBlock()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <DbProvider>
        <ElectronWindowClose />
        <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-slate-950">
          <ElectronDesktopTitleBar />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <DbGate>
              <BrowserRouter>
                <AppSettingsProvider>
                  <DashboardPeriodProvider>
                    <App />
                  </DashboardPeriodProvider>
                </AppSettingsProvider>
              </BrowserRouter>
            </DbGate>
          </div>
        </div>
      </DbProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
