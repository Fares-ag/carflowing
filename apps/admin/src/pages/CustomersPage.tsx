import { useEffect, useMemo, useState } from 'react'
import type { User } from '@carflow/shared'
import { listCustomers } from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import { InfoModal } from '../components/InfoModal'
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Search,
  UserRound,
  UserX,
  Users,
} from 'lucide-react'
import './CustomersPage.css'

const getInitials = (name: string) =>
  name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const downloadCsv = (filename: string, rows: Array<Record<string, string>>) => {
  const headers = Object.keys(rows[0] ?? {})
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(header => `"${row[header] ?? ''}"`).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function CustomersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    listCustomers({ pageSize: 12 }).then((data) => setUsers(data.items))
  }, [])

  const customerRows = useMemo(() => {
    return users.map((user, index) => ({
      id: `U${String(index + 1).padStart(3, '0')}`,
      name: user.name,
      initials: getInitials(user.name),
      email: user.email,
      phone: user.phone ?? '+974 5555 0000',
      joinDate: new Date(user.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }),
      rentals: String(2 + index * 2),
      spent: `QAR ${(4200 + index * 850).toLocaleString('en-US')}`,
      verification: index % 4 === 0 ? 'unverified' : 'verified',
      status: index % 5 === 0 ? 'suspended' : 'active',
    }))
  }, [users])

  const filteredRows = useMemo(() => {
    const normalizedStatus = statusFilter.toLowerCase()
    const base = normalizedStatus === 'all'
      ? customerRows
      : customerRows.filter(row => row.status.toLowerCase() === normalizedStatus)
    if (!searchQuery.trim()) return base
    const query = searchQuery.toLowerCase()
    return base.filter(row =>
      [row.name, row.email].some(value => value.toLowerCase().includes(query))
    )
  }, [customerRows, searchQuery, statusFilter])

  const stats = useMemo(() => {
    const total = customerRows.length
    const active = customerRows.filter(row => row.status === 'active').length
    const verified = customerRows.filter(row => row.verification === 'verified').length
    const suspended = customerRows.filter(row => row.status === 'suspended').length

    return [
      { label: 'Total Users', value: String(total), icon: <Users size={18} />, tone: 'dark' },
      { label: 'Active Users', value: String(active), icon: <UserRound size={18} />, tone: 'green' },
      { label: 'Verified', value: String(verified), icon: <CheckCircle2 size={18} />, tone: 'blue' },
      { label: 'Suspended', value: String(suspended), icon: <UserX size={18} />, tone: 'red' },
    ] as const
  }, [customerRows])

  return (
    <AdminLayout title="Customers" subtitle="Customer database and management">
      <div className="customersPage">
        <div className="customersStats">
          {stats.map((stat) => (
            <div key={stat.label} className="customersStatCard">
              <div>
                <div className="customersStatLabel">{stat.label}</div>
                <div className={`customersStatValue customersStatValue--${stat.tone}`}>{stat.value}</div>
              </div>
              {stat.icon}
            </div>
          ))}
        </div>

        <div className="customersControls">
          <div className="customersControlsHeader">
            <div className="customersControlsTitle">User Management</div>
            <div className="customersControlsSub">Manage and monitor all registered users</div>
          </div>
          <div className="customersControlsRow">
            <div className="customersSearch">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <label className="customersSelect">
              <select
                aria-label="Filter users by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All Users</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              className="customersExport"
              type="button"
              onClick={() => {
                downloadCsv(
                  'customers.csv',
                  filteredRows.map(row => ({
                    id: row.id,
                    name: row.name,
                    email: row.email,
                    phone: row.phone,
                    joinDate: row.joinDate,
                    status: row.status,
                  }))
                )
              }}
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        <div className="customersTableCard">
          <table className="customersTable">
            <thead>
              <tr>
                <th>User</th>
                <th>Contact</th>
                <th>Join Date</th>
                <th>Total Rentals</th>
                <th>Total Spent</th>
                <th>Verification</th>
                <th>Status</th>
                <th className="customersTableActions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="customersUser">
                      <span className="customersAvatar">{user.initials}</span>
                      <div>
                        <div className="customersUserName">{user.name}</div>
                        <div className="customersUserId">{user.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="customersContact">
                      <div>
                        <Mail size={14} />
                        {user.email}
                      </div>
                      <div>
                        <Phone size={14} />
                        {user.phone}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="customersJoinDate">
                      <Calendar size={14} />
                      {user.joinDate}
                    </div>
                  </td>
                  <td>{user.rentals}</td>
                  <td>{user.spent}</td>
                  <td>
                    <span className={`customersBadge customersBadge--${user.verification}`}>
                      {user.verification === 'verified' ? <CheckCircle2 size={14} /> : <UserX size={14} />}
                      {user.verification === 'verified' ? 'Verified' : 'Unverified'}
                    </span>
                  </td>
                  <td>
                    <span className={`customersStatus customersStatus--${user.status}`}>
                      {user.status === 'active' ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="customersRowActions">
                    <button
                      className="customersIconButton"
                      type="button"
                      onClick={() =>
                        setInfoModal({
                          title: user.name,
                          message: `Email: ${user.email}\nStatus: ${user.status}`,
                        })
                      }
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className="customersIconButton"
                      type="button"
                      onClick={() =>
                        setInfoModal({
                          title: 'Customer Action',
                          message: `Action for ${user.name}`,
                        })
                      }
                    >
                      {user.id === 'U001' ? <Pencil size={16} /> : <MoreHorizontal size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
    </AdminLayout>
  )
}
