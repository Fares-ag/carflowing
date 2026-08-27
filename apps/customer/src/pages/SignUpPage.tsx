import { getRedirectTarget, isTemporarilyUnavailable, MIN_PASSWORD_LENGTH, validatePassword, withRedirectParam } from '@carflow/shared'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import { LEGAL_ROUTES, SIGNUP_CONSENT_KINDS } from '../constants/legal'
import { useAuth } from '../contexts/AuthContext'
import { signUp } from '../services/authService'
import { recordConsentsSafely } from '../services/consentService'
import './SignUpPage.css'

export function SignUpPage() {
  const navigate = useNavigate()
  const { refetch } = useAuth()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')
  const refFromUrl = searchParams.get('ref')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [referralCode, setReferralCode] = useState(refFromUrl?.trim().toUpperCase() ?? '')
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (!acceptedLegal) {
      setError('Please accept the Terms of Service and Privacy Notice to continue.')
      return
    }
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
      await signUp({
        email: email.trim(),
        password,
        name: name.trim(),
        referralCode: referralCode.trim() || undefined,
      })
      // The account exists and the auth cookies are set, so the consent rows
      // can be filed against it. Best-effort: the tick box is what binds the
      // customer, and a telemetry failure must not strand a new account.
      await recordConsentsSafely(SIGNUP_CONSENT_KINDS)
      await refetch()
      navigate(getRedirectTarget(redirect, '/browse'))
    } catch (err) {
      setError(
        isTemporarilyUnavailable(err)
          ? 'New signups are temporarily paused. Please try again later.'
          : err instanceof Error
            ? err.message
            : 'Unable to create account'
      )
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
              Referral code <span style={{ fontWeight: 400, opacity: 0.7 }}>(optional)</span>
              <input
                className="customerSignUpInput"
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Friend's code"
                autoComplete="off"
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

            <label className="customerSignUpConsent">
              <input
                type="checkbox"
                checked={acceptedLegal}
                onChange={(e) => {
                  setAcceptedLegal(e.target.checked)
                  if (e.target.checked) setError('')
                }}
                required
              />
              <span>
                I have read and accept the{' '}
                <Link to={LEGAL_ROUTES.terms} target="_blank" rel="noreferrer">
                  Terms of Service
                </Link>{' '}
                and the{' '}
                <Link to={LEGAL_ROUTES.privacy} target="_blank" rel="noreferrer">
                  Privacy Notice
                </Link>
                , including how CarFlow handles my Qatar ID and driving licence.
              </span>
            </label>

            {error ? <div className="customerSignUpError">{error}</div> : null}

            <button
              className="customerSignUpButton"
              type="submit"
              disabled={isSubmitting || !acceptedLegal}
            >
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
