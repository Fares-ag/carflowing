import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../services/authService'
import './LoginPage.css'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('dealer@carflow.com')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(email, password)
      navigate('/dashboard')
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
              placeholder="dealer@carflow.com"
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
              placeholder="password"
              required
            />
          </label>

          {error ? <div className="dealerLoginError">{error}</div> : null}

          <button className="dealerLoginButton" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
