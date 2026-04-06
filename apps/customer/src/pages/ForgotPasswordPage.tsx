import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { supabase } from '@carflow/shared'
import './LoginPage.css'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      })
      if (resetError) throw resetError
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset email')
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
            {success
              ? 'Check your email for a password reset link.'
              : 'Enter your email and we\'ll send you a reset link.'}
          </div>

          {!success && (
            <form className="customerLoginForm" onSubmit={handleSubmit}>
              <label className="customerLoginLabel">
                Email
                <input
                  className="customerLoginInput"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>

              {error && <div className="customerLoginError">{error}</div>}

              <button className="customerLoginButton" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send Reset Link'}
              </button>

              <p className="customerLoginFooter">
                <Link to="/login">Back to login</Link>
              </p>
            </form>
          )}

          {success && (
            <p className="customerLoginFooter" style={{ marginTop: '1rem' }}>
              <Link to="/login">Back to login</Link>
            </p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}
