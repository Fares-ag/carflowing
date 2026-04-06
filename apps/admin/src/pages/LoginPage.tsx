import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../services/authService'
import './LoginPage.css'

export function LoginPage() {
  const navigate = useNavigate()
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
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to login')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="adminLogin">
      <div className="adminLoginCard">
        <div className="adminLoginTitle">Admin Login</div>
        <div className="adminLoginSubtitle">Sign in with your admin account.</div>

        <form className="adminLoginForm" onSubmit={handleSubmit}>
          <label className="adminLoginLabel">
            Email
            <input
              className="adminLoginInput"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="admin@example.com"
              required
            />
          </label>

          <label className="adminLoginLabel">
            Password
            <input
              className="adminLoginInput"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
          </label>

          {error ? <div className="adminLoginError">{error}</div> : null}

          <button className="adminLoginButton" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
