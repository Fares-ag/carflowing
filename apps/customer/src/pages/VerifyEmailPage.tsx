import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiRequest } from '@carflow/shared'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import './LoginPage.css'

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
    <div className="customerAuthPage">
      <Header />
      <div className="customerLogin">
        <div className="customerLoginCard">
          <div className="customerLoginTitle">Email verification</div>
          <div className="customerLoginSubtitle">{message}</div>

          {status === 'loading' ? (
            <p className="customerLoginFooter">Please wait…</p>
          ) : (
            <p className="customerLoginFooter">
              <Link to={status === 'success' ? '/browse' : '/login'}>
                {status === 'success' ? 'Browse cars' : 'Back to login'}
              </Link>
            </p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}
