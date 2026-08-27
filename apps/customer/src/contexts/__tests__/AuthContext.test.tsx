import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../AuthContext'
import { getSession, logout as authLogout } from '../../services/authService'

vi.mock('../../services/authService', () => ({
  getSession: vi.fn(),
  logout: vi.fn(),
}))

const SESSION = {
  userId: 'cus_1',
  role: 'customer' as const,
  name: 'Sara Ali',
  email: 'sara@example.com',
}

function Consumer() {
  const { session, logout } = useAuth()
  return (
    <div>
      <span data-testid="session">{session ? session.email : 'signed-out'}</span>
      <button
        type="button"
        onClick={() => {
          logout().catch((err) => {
            const node = document.createElement('span')
            node.dataset.testid = 'logout-error'
            node.textContent = err instanceof Error ? err.message : String(err)
            document.body.appendChild(node)
          })
        }}
      >
        Sign out
      </button>
    </div>
  )
}

describe('AuthContext logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSession).mockResolvedValue(SESSION)
  })

  it('UI-C-AUTH-01: clears the local session on a successful sign-out', async () => {
    vi.mocked(authLogout).mockResolvedValue(undefined)
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('sara@example.com'))

    await userEvent.click(screen.getByRole('button', { name: /Sign out/i }))

    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed-out'))
  })

  it('UI-C-AUTH-02: still clears local state when the sign-out request fails, and surfaces the error', async () => {
    vi.mocked(authLogout).mockRejectedValue(new Error('Network error'))
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('sara@example.com'))

    await userEvent.click(screen.getByRole('button', { name: /Sign out/i }))

    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed-out'))
    await waitFor(() =>
      expect(screen.getByTestId('logout-error')).toHaveTextContent('Network error')
    )
  })
})
