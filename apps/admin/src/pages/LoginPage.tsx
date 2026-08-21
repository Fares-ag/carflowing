import type { FormEvent} from 'react';
import { useState } from 'react'

import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { acceptStaffInvite, login , isAdminPortalRole } from '../services/authService'

import { useAuth } from '../contexts/AuthContext'

import { getRedirectTarget } from '@carflow/shared'

import './LoginPage.css'



export function LoginPage() {

  const navigate = useNavigate()

  const { refetch, session, isLoading } = useAuth()

  const [searchParams] = useSearchParams()

  const redirect = searchParams.get('redirect')

  const staffInviteToken = searchParams.get('staffInvite')

  const [email, setEmail] = useState('')

  const [password, setPassword] = useState('')

  const [inviteName, setInviteName] = useState('')

  const [invitePassword, setInvitePassword] = useState('')

  const [error, setError] = useState('')

  const [inviteSuccess, setInviteSuccess] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)



  if (!isLoading && session && isAdminPortalRole(session.role)) {

    return <Navigate to={getRedirectTarget(redirect)} replace />

  }



  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {

    event.preventDefault()

    setError('')

    setIsSubmitting(true)



    try {

      await login(email, password)

      await refetch()

      navigate(getRedirectTarget(redirect))

    } catch (err) {

      setError(err instanceof Error ? err.message : 'Unable to login')

    } finally {

      setIsSubmitting(false)

    }

  }



  const handleInviteAccept = async (event: FormEvent<HTMLFormElement>) => {

    event.preventDefault()

    if (!staffInviteToken) return

    setError('')

    setInviteSuccess('')

    setIsSubmitting(true)

    try {

      const result = await acceptStaffInvite({

        token: staffInviteToken,

        password: invitePassword,

        name: inviteName.trim() || undefined,

      })

      setInviteSuccess(`Account created for ${result.email}. Sign in with your new password.`)

      setEmail(result.email)

      setPassword('')

      setInvitePassword('')

    } catch (err) {

      setError(err instanceof Error ? err.message : 'Unable to accept invite')

    } finally {

      setIsSubmitting(false)

    }

  }



  if (staffInviteToken) {

    return (

      <div className="adminLogin">

        <div className="adminLoginCard">

          <div className="adminLoginTitle">Accept staff invite</div>

          <div className="adminLoginSubtitle">Set your password to join the admin portal.</div>



          <form className="adminLoginForm" onSubmit={handleInviteAccept}>

            <label className="adminLoginLabel">

              Name (optional)

              <input

                className="adminLoginInput"

                type="text"

                value={inviteName}

                onChange={(event) => setInviteName(event.target.value)}

                placeholder="Your name"

              />

            </label>



            <label className="adminLoginLabel">

              Password

              <input

                className="adminLoginInput"

                type="password"

                value={invitePassword}

                onChange={(event) => setInvitePassword(event.target.value)}

                placeholder="Create a secure password"

                required

              />

            </label>



            {error ? <div className="adminLoginError">{error}</div> : null}

            {inviteSuccess ? <div className="adminLoginSuccess">{inviteSuccess}</div> : null}



            <button className="adminLoginButton" type="submit" disabled={isSubmitting}>

              {isSubmitting ? 'Creating account…' : 'Accept invite'}

            </button>

          </form>

        </div>

      </div>

    )

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


