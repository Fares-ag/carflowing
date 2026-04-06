import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'

async function bootstrap() {
  if (import.meta.env.VITE_USE_MOCK_API === 'true') {
    const { worker } = await import('./mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </React.StrictMode>,
  )
}

bootstrap()

