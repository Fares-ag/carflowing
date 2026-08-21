import { MIN_PASSWORD_LENGTH, validatePassword } from '@carflow/shared'
import type { FormEvent} from 'react';
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import { resetPassword } from '../services/authService'
import './LoginPage.css'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!token) {
      setError('This reset link is missing its token. Please request a new one.')
      return
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setIsSubmitting(true)
    try {
      await resetPassword(token, password)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="customerAuthPage">
      <Header />
      <div className="customerLogin">
        <div className="customerLoginCard">
          <div className="customerLoginTitle">Reset Password</div>
          <div className="customerLoginSubtitle">
            {success ? 'Your password has been reset.' : 'Choose a new password for your account.'}
          </div>

          {!success && (
            <form className="customerLoginForm" onSubmit={handleSubmit}>
              <label className="customerLoginLabel">
                New Password
                <input
                  className="customerLoginInput"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters, with a letter and number`}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </label>

              <label className="customerLoginLabel">
                Confirm Password
                <input
                  className="customerLoginInput"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </label>

              {error && <div className="customerLoginError">{error}</div>}

              <button className="customerLoginButton" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Resetting...' : 'Reset Password'}
              </button>

              <p className="customerLoginFooter">
                <Link to="/login">Back to login</Link>
              </p>
            </form>
          )}

          {success && (
            <p className="customerLoginFooter" style={{ marginTop: '1rem' }}>
              <Link to="/login">Continue to login</Link>
            </p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}
