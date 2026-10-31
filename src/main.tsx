import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { DbGate } from './components/DbGate.tsx'
import { DbProvider } from './context/DbProvider.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DbProvider>
      <DbGate>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DbGate>
    </DbProvider>
  </StrictMode>,
)
