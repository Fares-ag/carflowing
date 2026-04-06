import { FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { login } from '../services/authService'
import './LoginPage.css'

function getRedirectTarget(redirect: string | null): string {
  if (!redirect) return '/dashboard'
  const path = decodeURIComponent(redirect)
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return '/dashboard'
}

export function LoginPage() {
  const navigate = useNavigate()
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
              Don&apos;t have an account? <Link to="/signup">Sign up</Link>
            </p>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  )
}
