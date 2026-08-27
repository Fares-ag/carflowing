import type { FormEvent} from 'react';
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import { useAuth } from '../contexts/AuthContext'
import { isLoginRequires2fa, login, verify2faLogin } from '../services/authService'
import { getRedirectTarget, withRedirectParam } from '@carflow/shared'
import './LoginPage.css'

export function LoginPage() {
  const navigate = useNavigate()
  const { refetch } = useAuth()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')
  const [email, setEmail] = useState(
    import.meta.env.DEV ? 'customer@carflow.dev' : ''
  )
  const [password, setPassword] = useState(import.meta.env.DEV ? 'password123' : '')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const result = await login(email.trim(), password)
      if (isLoginRequires2fa(result)) {
        setChallengeToken(result.challengeToken)
        return
      }
      await refetch()
      navigate(getRedirectTarget(redirect, '/browse'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to login')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerify2fa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!challengeToken) return
    setError('')
    setIsSubmitting(true)
    try {
      await verify2faLogin(challengeToken, totpCode.trim())
      await refetch()
      navigate(getRedirectTarget(redirect, '/browse'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid authentication code')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="customerAuthPage">
      <Header />
      <div className="customerLogin" role="main">
        <div className="customerLoginCard">
          <div className="customerLoginTitle">
            {challengeToken ? 'Two-factor authentication' : 'Customer Login'}
          </div>
          <div className="customerLoginSubtitle">
            {challengeToken
              ? 'Enter the code from your authenticator app.'
              : 'Sign in with your customer account.'}
          </div>
          {import.meta.env.DEV && !challengeToken && (
            <p className="customerLoginDemo">
              Demo: <code>customer@carflow.dev</code> / <code>password123</code>
            </p>
          )}

          {challengeToken ? (
            <form className="customerLoginForm" onSubmit={handleVerify2fa}>
              <label className="customerLoginLabel">
                Authentication code
                <input
                  className="customerLoginInput"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                />
              </label>

              {error ? <div className="customerLoginError">{error}</div> : null}

              <button className="customerLoginButton" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Verifying…' : 'Verify & sign in'}
              </button>

              <button
                type="button"
                className="customerLoginForgot"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => {
                  setChallengeToken(null)
                  setTotpCode('')
                  setError('')
                }}
              >
                Back to login
              </button>
            </form>
          ) : (
            <form className="customerLoginForm" onSubmit={handleSubmit}>
              <label className="customerLoginLabel">
                Email
                <input
                  className="customerLoginInput"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className="customerLoginLabel">
                Password
                <input
                  className="customerLoginInput"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </label>

              {error ? <div className="customerLoginError">{error}</div> : null}

              <Link to="/forgot-password" className="customerLoginForgot">
                Forgot password?
              </Link>

              <button className="customerLoginButton" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>

              <p className="customerLoginFooter">
                Don&apos;t have an account?{' '}
                <Link to={withRedirectParam('/signup', redirect)}>Sign up</Link>
              </p>
            </form>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}
