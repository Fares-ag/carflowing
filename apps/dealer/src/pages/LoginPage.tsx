import type { FormEvent} from 'react';
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { login } from '../services/authService'
import { getRedirectTarget, withRedirectParam } from '@carflow/shared'
import './LoginPage.css'

export function LoginPage() {
  const navigate = useNavigate()
  const { refetch } = useAuth()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(email, password)
      await refetch()
      navigate(getRedirectTarget(redirect))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to login')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="dealerLogin">
      <div className="dealerLoginCard">
        <div className="dealerLoginTitle">Dealer Login</div>
        <div className="dealerLoginSubtitle">Sign in with your dealer account.</div>

        <form className="dealerLoginForm" onSubmit={handleSubmit}>
          <label className="dealerLoginLabel">
            Email
            <input
              className="dealerLoginInput"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="dealerLoginLabel">
            Password
            <input
              className="dealerLoginInput"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
          </label>

          {error ? <div className="dealerLoginError">{error}</div> : null}

          <button className="dealerLoginButton" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="dealerLoginFooter">
          Don&apos;t have an account?{' '}
          <Link to={withRedirectParam('/signup', redirect)}>Apply as dealer</Link>
        </p>
      </div>
    </div>
  )
}
