import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@carflow/shared'
import './SignUpPage.css'

export function SignUpPage() {
  const [businessName, setBusinessName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setIsSubmitting(true)
    try {
      const email = contactEmail.trim()
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: ownerName.trim(),
            business_name: businessName.trim(),
            phone: contactPhone.trim(),
            address: address.trim(),
          },
        },
      })
      if (signUpError) {
        throw new Error(signUpError.message)
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit application')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="dealerSignUp">
      <div className="dealerSignUpCard">
        <div className="dealerSignUpTitle">Dealer application</div>
        <div className="dealerSignUpSubtitle">
          Create an account so we can review and activate your dealership.
        </div>

        {submitted ? (
          <p className="dealerSignUpSuccess" role="status">
            Your dealer account request has been submitted. An admin will review and activate your
            account. You&apos;ll receive an email when approved.
          </p>
        ) : (
          <form className="dealerSignUpForm" onSubmit={handleSubmit}>
            <label className="dealerSignUpLabel">
              Business name
              <input
                className="dealerSignUpInput"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your dealership name"
                required
                autoComplete="organization"
              />
            </label>

            <label className="dealerSignUpLabel">
              Contact email
              <input
                className="dealerSignUpInput"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="contact@dealership.com"
                required
                autoComplete="email"
              />
            </label>

            <label className="dealerSignUpLabel">
              Contact phone
              <input
                className="dealerSignUpInput"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+974 …"
                autoComplete="tel"
              />
            </label>

            <label className="dealerSignUpLabel">
              Address
              <input
                className="dealerSignUpInput"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, city"
                autoComplete="street-address"
              />
            </label>

            <label className="dealerSignUpLabel">
              Owner name
              <input
                className="dealerSignUpInput"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Full name"
                required
                autoComplete="name"
              />
            </label>

            <label className="dealerSignUpLabel">
              Password
              <input
                className="dealerSignUpInput"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                autoComplete="new-password"
                minLength={6}
              />
            </label>

            {error ? <div className="dealerSignUpError">{error}</div> : null}

            <button className="dealerSignUpButton" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        )}

        <p className="dealerSignUpFooter">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
