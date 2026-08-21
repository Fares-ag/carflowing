import { QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App.tsx'
import { ErrorBoundary } from '@carflow/shared'
import { AuthProvider } from './contexts/AuthContext'
import { queryClient } from './lib/queryClient'
import './i18n'
import './index.css'

async function bootstrap() {
  if (import.meta.env.VITE_USE_MOCK_API === 'true') {
    const { worker } = await import('./mocks/browser')
    await worker.start({ onUnhandledRequest: 'warn' })
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <AuthProvider>
            <App />
            <Toaster position="top-right" richColors closeButton />
          </AuthProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    </React.StrictMode>,
  )
}

bootstrap()

