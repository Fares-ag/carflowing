import { formatDate } from '@carflow/shared'
import { Mail, RefreshCw, UserMinus, UserPlus, X } from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { AdminLayout } from '../layout/AdminLayout'
import {
  createStaffInvite,
  deactivateStaffMember,
  listStaffInvites,
  listStaffMembers,
  resendStaffInvite,
  revokeStaffInvite,
  type StaffInvite,
  type StaffMember,
} from '../services/adminService'
import './StaffPage.css'

type PortalRole = StaffMember['role']

export function StaffPage() {
  const { session } = useAuth()
  const canInvite = session?.role === 'admin'
  const [members, setMembers] = useState<StaffMember[]>([])
  const [invites, setInvites] = useState<StaffInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<PortalRole>('ops')
  const [actionId, setActionId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([listStaffMembers(), listStaffInvites()])
      .then(([staff, pending]) => {
        setMembers(staff.items)
        setInvites(pending.items.filter((invite) => !invite.acceptedAt))
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load staff'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === 'active'),
    [members]
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !name.trim()) {
      toast.error('Email and name are required')
      return
    }
    setSubmitting(true)
    try {
      await createStaffInvite({ email: email.trim(), name: name.trim(), role })
      toast.success('Invite sent')
      setEmail('')
      setName('')
      setRole('ops')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to send invite')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivate = async (member: StaffMember) => {
    if (member.id === session?.userId) {
      toast.error('You cannot deactivate your own account')
      return
    }
    if (!window.confirm(`Deactivate ${member.name}? Their sessions will be revoked immediately.`)) {
      return
    }
    setActionId(member.id)
    try {
      await deactivateStaffMember(member.id)
      toast.success(`${member.name} deactivated`)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to deactivate staff member')
    } finally {
      setActionId(null)
    }
  }

  const handleResend = async (invite: StaffInvite) => {
    setActionId(invite.id)
    try {
      await resendStaffInvite(invite.id)
      toast.success(`Invite resent to ${invite.email}`)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to resend invite')
    } finally {
      setActionId(null)
    }
  }

  const handleRevoke = async (invite: StaffInvite) => {
    if (!window.confirm(`Revoke the invite for ${invite.email}?`)) return
    setActionId(invite.id)
    try {
      await revokeStaffInvite(invite.id)
      toast.success('Invite revoked')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to revoke invite')
    } finally {
      setActionId(null)
    }
  }

  if (!canInvite) {
    return (
      <AdminLayout title="Staff" subtitle="Team invitations">
        <div className="staffPage">
          <div className="staffForbidden">Only full admins can manage staff invites.</div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title="Staff" subtitle="Invite portal users, manage active staff, and offboard departing employees">
      <div className="staffPage">
        <form className="staffInviteForm" onSubmit={handleSubmit}>
          <h2 className="staffFormTitle">
            <UserPlus size={18} />
            Send invite
          </h2>
          <div className="staffFormGrid">
            <label className="staffField">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ops User" required />
            </label>
            <label className="staffField">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ops@example.com"
                required
              />
            </label>
            <label className="staffField">
              Role
              <select value={role} onChange={(e) => setRole(e.target.value as PortalRole)}>
                <option value="admin">Admin</option>
                <option value="finance">Finance</option>
                <option value="ops">Ops</option>
                <option value="support">Support</option>
              </select>
            </label>
          </div>
          <button type="submit" className="staffSubmitBtn" disabled={submitting}>
            <Mail size={14} />
            {submitting ? 'Sending…' : 'Send invite'}
          </button>
        </form>

        <div className="staffTableCard">
          <h2 className="staffSectionTitle">Active staff</h2>
          {loading ? (
            <div className="staffEmpty">Loading staff…</div>
          ) : activeMembers.length === 0 ? (
            <div className="staffEmpty">No active staff members.</div>
          ) : (
            <div className="staffTableWrap">
              <table className="staffTable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {activeMembers.map((member) => (
                    <tr key={member.id}>
                      <td>{member.name}</td>
                      <td>{member.email}</td>
                      <td className="staffRole">{member.role}</td>
                      <td>
                        <span className="staffStatus staffStatus--accepted">{member.status}</span>
                      </td>
                      <td>{formatDate(member.createdAt)}</td>
                      <td className="staffActions">
                        <button
                          type="button"
                          className="staffActionBtn staffActionBtn--danger"
                          disabled={actionId === member.id || member.id === session?.userId}
                          onClick={() => handleDeactivate(member)}
                        >
                          <UserMinus size={14} />
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="staffTableCard">
          <h2 className="staffSectionTitle">Pending invites</h2>
          {loading ? (
            <div className="staffEmpty">Loading invites…</div>
          ) : invites.length === 0 ? (
            <div className="staffEmpty">No pending invites.</div>
          ) : (
            <div className="staffTableWrap">
              <table className="staffTable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Expires</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={invite.id}>
                      <td>{invite.name}</td>
                      <td>{invite.email}</td>
                      <td className="staffRole">{invite.role}</td>
                      <td>{formatDate(invite.expiresAt)}</td>
                      <td>{formatDate(invite.createdAt)}</td>
                      <td className="staffActions">
                        <button
                          type="button"
                          className="staffActionBtn"
                          disabled={actionId === invite.id}
                          onClick={() => handleResend(invite)}
                        >
                          <RefreshCw size={14} />
                          Resend
                        </button>
                        <button
                          type="button"
                          className="staffActionBtn staffActionBtn--danger"
                          disabled={actionId === invite.id}
                          onClick={() => handleRevoke(invite)}
                        >
                          <X size={14} />
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
