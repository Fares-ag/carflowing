import { FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MIN_PASSWORD_LENGTH, validatePassword } from '@carflow/shared'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { signUp } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'
import { getRedirectTarget, withRedirectParam } from '../utils/authRedirect'
import './SignUpPage.css'

export function SignUpPage() {
  const navigate = useNavigate()
  const { refetch } = useAuth()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')
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
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setIsSubmitting(true)
    try {
      await signUp({ email: email.trim(), password, name: name.trim() })
      await refetch()
      navigate(getRedirectTarget(redirect))
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
          <div className="customerSignUpSubtitle">
            Sign up to request a car and track it in My booking.
          </div>

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
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters, with a letter and number`}
                required
                minLength={MIN_PASSWORD_LENGTH}
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
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
              />
            </label>

            {error ? <div className="customerSignUpError">{error}</div> : null}

            <button className="customerSignUpButton" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="customerSignUpFooter">
            Already have an account?{' '}
            <Link to={withRedirectParam('/login', redirect)}>Sign in</Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
