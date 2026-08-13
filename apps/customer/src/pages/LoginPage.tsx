import { FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { login } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'
import { getRedirectTarget, withRedirectParam } from '../utils/authRedirect'
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(email.trim(), password)
      await refetch()
      navigate(getRedirectTarget(redirect))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to login')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="customerAuthPage">
      <Header />
      <div className="customerLogin">
        <div className="customerLoginCard">
          <div className="customerLoginTitle">Customer Login</div>
          <div className="customerLoginSubtitle">Sign in with your customer account.</div>
          {import.meta.env.DEV && (
            <p className="customerLoginDemo">
              Demo: <code>customer@carflow.dev</code> / <code>password123</code>
            </p>
          )}

          <form className="customerLoginForm" onSubmit={handleSubmit}>
            <label className="customerLoginLabel">
              Email
              <input
                className="customerLoginInput"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
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
                onChange={event => setPassword(event.target.value)}
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
        </div>
      </div>
      <Footer />
    </div>
  )
}
