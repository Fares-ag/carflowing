import { useEffect, useMemo, useState } from 'react'
import type { Dealer } from '@carflow/shared'
import { listDealers, updateDealerStatus } from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import { InfoModal } from '../components/InfoModal'
import {
  ChevronDown,
  Download,
  Eye,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Search,
  Star,
  UserCheck,
  Users,
  Wallet,
  Clock,
} from 'lucide-react'
import './DealersPage.css'

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

const STATUS_CLASS: Record<string, string> = {
  Active: 'dealersBadge dealersBadge--active',
  'Pending Approval': 'dealersBadge dealersBadge--pending',
  Suspended: 'dealersBadge dealersBadge--pending'
}

export function DealersPage() {
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

  const refreshDealers = () => {
    listDealers({ pageSize: 10 }).then((data) => setDealers(data.items))
  }

  useEffect(() => {
    refreshDealers()
  }, [])

  const dealerRows = useMemo(() => {
    return dealers.map((dealer, index) => {
      const pending = dealer.status === 'pending'
      return {
        id: `D${String(index + 1).padStart(3, '0')}`,
        sourceId: dealer.id,
        name: dealer.name,
        contact: `Contact ${index + 1}`,
        email: dealer.contactEmail,
        phone: dealer.contactPhone ?? '+974 4444 0000',
        location: pending ? 'Al Sadd, Doha' : 'West Bay, Doha',
        fleetSize: `${dealer.vehiclesCount} cars`,
        activeRentals: String(dealer.activeRentals),
        revenue: `QAR ${dealer.totalRevenue.toLocaleString('en-US')}`,
        rating: dealer.rating.toFixed(1),
        reviews: `(${120 + index * 6})`,
        status: dealer.status === 'suspended' ? 'Suspended' : pending ? 'Pending Approval' : 'Active',
      }
    })
  }, [dealers])

  const filteredRows = useMemo(() => {
    const normalizedStatus = statusFilter.toLowerCase()
    const base = normalizedStatus === 'all'
      ? dealerRows
      : dealerRows.filter(row => row.status.toLowerCase().includes(normalizedStatus))
    if (!searchQuery.trim()) return base
    const query = searchQuery.toLowerCase()
    return base.filter(row =>
      [row.name, row.contact, row.email].some(value => value.toLowerCase().includes(query))
    )
  }, [dealerRows, searchQuery, statusFilter])

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(dealerRows.map(row => row.status)))
    return ['all', ...values]
  }, [dealerRows])

  const stats = useMemo(() => {
    const total = dealerRows.length
    const active = dealerRows.filter(row => row.status === 'Active').length
    const pending = dealerRows.filter(row => row.status === 'Pending Approval').length
    const revenue = dealerRows.reduce((sum, row) => {
      const numeric = Number(row.revenue.replace(/[^\d.]/g, ''))
      return sum + (Number.isNaN(numeric) ? 0 : numeric)
    }, 0)

    return {
      total,
      active,
      pending,
      revenue,
    }
  }, [dealerRows])

  return (
    <AdminLayout title="Dealers" subtitle="Dealer accounts and approvals">
      <div className="dealersPage">
        <div className="dealersStats">
          <div className="dealersStatCard">
            <div className="dealersStatHeader">
              <div className="dealersStatLabel">Total Dealers</div>
              <Users size={18} className="dealersStatIcon" />
            </div>
            <div className="dealersStatValue">{stats.total}</div>
          </div>
          <div className="dealersStatCard">
            <div className="dealersStatHeader">
              <div className="dealersStatLabel">Active Dealers</div>
              <UserCheck size={18} className="dealersStatIcon" />
            </div>
            <div className="dealersStatValue dealersStatValue--green">{stats.active}</div>
          </div>
          <div className="dealersStatCard">
            <div className="dealersStatHeader">
              <div className="dealersStatLabel">Total Revenue</div>
              <Wallet size={18} className="dealersStatIcon" />
            </div>
            <div className="dealersStatValue dealersStatValue--blue">
              QAR {stats.revenue.toLocaleString('en-US')}
            </div>
          </div>
          <div className="dealersStatCard">
            <div className="dealersStatHeader">
              <div className="dealersStatLabel">Pending Approval</div>
              <Clock size={18} className="dealersStatIcon" />
            </div>
            <div className="dealersStatValue dealersStatValue--orange">{stats.pending}</div>
          </div>
        </div>

        <div className="dealersControlCard">
          <div className="dealersControlHeader">
            <div className="dealersControlTitle">Dealer Management</div>
            <div className="dealersControlSubtitle">Manage and monitor all registered dealers</div>
          </div>
          <div className="dealersControlRow">
            <div className="dealersSearch">
              <Search size={16} className="dealersSearchIcon" />
              <input
                type="text"
                placeholder="Search by company or contact name..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <label className="dealersFilterBtn">
              <select
                aria-label="Filter dealers by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {statusOptions.map(option => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All Dealers' : option}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              className="dealersExportBtn"
              type="button"
              onClick={() => {
                downloadCsv(
                  'dealers.csv',
                  filteredRows.map(row => ({
                    id: row.id,
                    name: row.name,
                    contact: row.contact,
                    email: row.email,
                    phone: row.phone,
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

        <div className="dealersTableCard">
          <div className="dealersTableWrap">
            <table className="dealersTable">
              <thead>
                <tr>
                  <th>Dealer</th>
                  <th>Contact</th>
                  <th>Location</th>
                  <th>Fleet Size</th>
                  <th>Active Rentals</th>
                  <th>Revenue</th>
                  <th>Rating</th>
                  <th>Status</th>
                  <th className="dealersTableActionsHead">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="dealersDealerCell">
                        <div className="dealersAvatar">
                          <Users size={16} />
                        </div>
                        <div>
                          <div className="dealersDealerName">{row.name}</div>
                          <div className="dealersDealerId">{row.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="dealersContactCell">
                        <div className="dealersContactName">{row.contact}</div>
                        <div className="dealersContactMeta">
                          <Mail size={14} />
                          {row.email}
                        </div>
                        <div className="dealersContactMeta">
                          <Phone size={14} />
                          {row.phone}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="dealersLocation">
                        <MapPin size={14} />
                        {row.location}
                      </div>
                    </td>
                    <td>{row.fleetSize}</td>
                    <td>{row.activeRentals}</td>
                    <td>{row.revenue}</td>
                    <td>
                      <div className="dealersRating">
                        <Star size={14} />
                        <span>{row.rating}</span>
                        <span className="dealersRatingCount">{row.reviews}</span>
                      </div>
                    </td>
                    <td>
                      <span className={STATUS_CLASS[row.status]}>{row.status}</span>
                    </td>
                    <td>
                      <div className="dealersActions">
                        <button
                          type="button"
                          className="dealersActionBtn"
                          onClick={() =>
                            setInfoModal({
                              title: row.name,
                              message: `Location: ${row.location}\nStatus: ${row.status}`,
                            })
                          }
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          type="button"
                          className="dealersActionBtn"
                          onClick={() => {
                            const nextStatus = row.status === 'Active' ? 'suspended' : 'active'
                            updateDealerStatus(row.sourceId, nextStatus).then(() => refreshDealers())
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
