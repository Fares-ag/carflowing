import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiRequest } from '@carflow/shared'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Verifying your email…')

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setMessage('Missing verification token.')
      return
    }
    apiRequest('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => {
        setStatus('success')
        setMessage('Your email is verified. You can pay online and manage bookings.')
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Verification failed.')
      })
  }, [params])

  return (
    <main style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
      <h1>Email verification</h1>
      <p>{message}</p>
      {status !== 'loading' ? (
        <p>
          <Link to={status === 'success' ? '/browse' : '/login'}>
            {status === 'success' ? 'Browse cars' : 'Back to login'}
          </Link>
        </p>
      ) : null}
    </main>
  )
}
