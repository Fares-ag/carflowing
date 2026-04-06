import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { signUp } from '../services/authService'
import './SignUpPage.css'

export function SignUpPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setIsSubmitting(true)
    try {
      await signUp({ email: email.trim(), password, name: name.trim() })
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="customerAuthPage">
      <Header />
      <main className="customerSignUp">
      <div className="customerSignUpCard">
        <div className="customerSignUpTitle">Create account</div>
        <div className="customerSignUpSubtitle">Sign up to book cars and manage your rentals.</div>

        <form className="customerSignUpForm" onSubmit={handleSubmit}>
          <label className="customerSignUpLabel">
            Full name
            <input
              className="customerSignUpInput"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              autoComplete="name"
            />
          </label>

          <label className="customerSignUpLabel">
            Email
            <input
              className="customerSignUpInput"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </label>

          <label className="customerSignUpLabel">
            Password
            <input
              className="customerSignUpInput"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>

          <label className="customerSignUpLabel">
            Confirm password
            <input
              className="customerSignUpInput"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>

          {error ? <div className="customerSignUpError">{error}</div> : null}

          <button className="customerSignUpButton" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="customerSignUpFooter">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
      <Footer />
    </div>
  )
}
