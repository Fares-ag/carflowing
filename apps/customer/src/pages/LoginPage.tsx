import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../services/authService'
import './LoginPage.css'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('customer@carflow.com')
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
              placeholder="customer@carflow.com"
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
              placeholder="password"
              required
            />
          </label>

          {error ? <div className="customerLoginError">{error}</div> : null}

          <button className="customerLoginButton" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
