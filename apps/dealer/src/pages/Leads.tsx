import { formatDateOrDash } from '@carflow/shared'
import {
  Car,
  Check,
  Mail,
  Phone,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import { createLead, listLeads, listInventory, removeLead, updateLead } from '../services/dealerService'
import './Leads.css'

interface LeadRow {
  id: string
  name: string
  email: string
  phone: string
  vehicle: string
  score: number
  status: 'New' | 'Contacted' | 'Qualified'
  priority: 'High' | 'Medium' | 'Low'
  source: string
  createdAt: string
  avatar: string
}

interface VehicleOption {
  id: string
  name: string
}

function mapLeadPriority(priority?: string): LeadRow['priority'] {
  if (priority === 'high') return 'High'
  if (priority === 'low') return 'Low'
  return 'Medium'
}

function vehicleInterestFromNotes(notes?: string): string {
  if (!notes) return '—'
  const match = notes.match(/^Vehicle interest:\s*(.+)$/m)
  return match?.[1]?.trim() || '—'
}

function buildLeadNotes(vehicleInterest: string, notes: string): string | undefined {
  const interest = vehicleInterest.trim()
  const body = notes.trim()
  const parts: string[] = []
  if (interest) parts.push(`Vehicle interest: ${interest}`)
  if (body) parts.push(body)
  return parts.length ? parts.join('\n') : undefined
}

export function Leads() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([])
  const [newLeadName, setNewLeadName] = useState('')
  const [newLeadEmail, setNewLeadEmail] = useState('')
  const [newLeadPhone, setNewLeadPhone] = useState('')
  const [newLeadSource, setNewLeadSource] = useState('Website')
  const [newLeadVehicle, setNewLeadVehicle] = useState('')
  const [newLeadStatus, setNewLeadStatus] = useState<'New' | 'Contacted' | 'Qualified'>('New')
  const [newLeadPriority, setNewLeadPriority] = useState<'High' | 'Medium' | 'Low'>('Medium')
  const [newLeadNotes, setNewLeadNotes] = useState('')
  const [manageStatus, setManageStatus] = useState<'New' | 'Contacted' | 'Qualified'>('New')
  const [managePriority, setManagePriority] = useState<'High' | 'Medium' | 'Low'>('Medium')
  const [manageScore, setManageScore] = useState(0)
  const [manageSource, setManageSource] = useState('Website')
  const [manageNotes, setManageNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshLeads = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true)
    setLoadError(null)
    return listLeads({ pageSize: 100 })
      .then((data) => {
        const mapped = data.items.map((lead) => ({
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone ?? '—',
          vehicle: vehicleInterestFromNotes(lead.notes),
          score: 0,
          status: (lead.stage === 'contacted'
            ? 'Contacted'
            : lead.stage === 'qualified'
              ? 'Qualified'
              : 'New') as LeadRow['status'],
          priority: mapLeadPriority(lead.priority),
          source: lead.source ?? 'Website',
          createdAt: lead.createdAt,
          avatar: lead.name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .slice(0, 2),
        }))
        setLeads(mapped)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load leads'
        setLoadError(message)
        toast.error(message)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void refreshLeads(true)
  }, [refreshLeads])

  useEffect(() => {
    listInventory({ pageSize: 100 }).then((data) => {
      setVehicleOptions(data.items.map((v) => ({ id: v.id, name: v.name })))
    }).catch((err) => console.error('Failed to load vehicles for lead form:', err))
  }, [])

  // Memoize callback to prevent unnecessary re-renders
  const handleManageLead = useCallback((lead: LeadRow) => {
    setSelectedLead(lead)
    setManageStatus(lead.status)
    setManagePriority(lead.priority)
    setManageScore(lead.score)
    setManageSource(lead.source)
    setManageNotes('')
    setShowManageModal(true)
  }, [])

  // Memoize filtered leads to avoid recalculating on every render
  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim()) {
      return leads
    }
    
    const query = searchQuery.toLowerCase()
    return leads.filter(lead =>
      lead.name.toLowerCase().includes(query) ||
      lead.email.toLowerCase().includes(query) ||
      lead.vehicle.toLowerCase().includes(query)
    )
  }, [searchQuery, leads])

  const leadStats = useMemo(() => {
    const newCount = leads.filter((l) => l.status === 'New').length
    const contactedCount = leads.filter((l) => l.status === 'Contacted').length
    const qualifiedCount = leads.filter((l) => l.status === 'Qualified').length
    const total = leads.length
    const conversionPct = total > 0 ? Math.round((qualifiedCount / total) * 100) : 0
    return { newCount, contactedCount, qualifiedCount, conversionPct }
  }, [leads])

  // Memoize callbacks for modal handlers
  const handleOpenAddModal = useCallback(() => {
    setShowAddModal(true)
  }, [])

  const handleCloseAddModal = useCallback(() => {
    setShowAddModal(false)
    setNewLeadName('')
    setNewLeadEmail('')
    setNewLeadPhone('')
    setNewLeadSource('Website')
    setNewLeadVehicle('')
    setNewLeadStatus('New')
    setNewLeadPriority('Medium')
    setNewLeadNotes('')
  }, [])

  const handleCloseManageModal = useCallback(() => {
    setShowManageModal(false)
    setSelectedLead(null)
  }, [])

  const handleCreateLead = useCallback(() => {
    if (!newLeadName.trim() || !newLeadEmail.trim()) {
      return
    }
    createLead({
      name: newLeadName.trim(),
      email: newLeadEmail.trim(),
      phone: newLeadPhone.trim() || undefined,
      source: newLeadSource,
      stage:
        newLeadStatus === 'Qualified' ? 'qualified' : newLeadStatus === 'Contacted' ? 'contacted' : 'new',
      priority: newLeadPriority.toLowerCase() as 'low' | 'medium' | 'high',
      notes: buildLeadNotes(newLeadVehicle, newLeadNotes),
    }).then(() => {
      void refreshLeads()
      handleCloseAddModal()
    }).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create lead')
    })
  }, [
    handleCloseAddModal,
    newLeadEmail,
    newLeadName,
    newLeadNotes,
    newLeadPhone,
    newLeadPriority,
    newLeadSource,
    newLeadStatus,
    newLeadVehicle,
    refreshLeads,
  ])

  const handleSaveLead = useCallback(() => {
    if (!selectedLead) return
    updateLead(selectedLead.id, {
      stage: manageStatus === 'Qualified' ? 'qualified' : manageStatus === 'Contacted' ? 'contacted' : 'new',
      source: manageSource,
      priority: managePriority.toLowerCase() as 'low' | 'medium' | 'high',
      notes: manageNotes.trim() || undefined,
    }).then(() => {
      refreshLeads()
      handleCloseManageModal()
    }).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update lead')
    })
  }, [handleCloseManageModal, manageNotes, managePriority, manageSource, manageStatus, refreshLeads, selectedLead])

  const handleDeleteLead = useCallback(() => {
    if (!selectedLead) return
    removeLead(selectedLead.id).then(() => {
      refreshLeads()
      handleCloseManageModal()
    })
  }, [handleCloseManageModal, refreshLeads, selectedLead])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }, [])

  const handleCallLead = useCallback((lead: LeadRow) => {
    window.open(`tel:${lead.phone}`, '_self')
  }, [])

  const handleEmailLead = useCallback((lead: LeadRow) => {
    window.open(`mailto:${lead.email}`, '_self')
  }, [])

  return (
    <div className="leads-page">
      <Sidebar />
      <Header />
      
      <div className="leads-content" role="main">
        <div className="page-header">
          <div className="page-title-section">
            <h1 className="page-title">Leads Management</h1>
            <p className="page-subtitle">Track and convert customer inquiries</p>
          </div>
          <button className="add-lead-btn" onClick={handleOpenAddModal}>
            <Plus size={14} />
            <span>Add Lead</span>
          </button>
        </div>

        <div className="stats-cards">
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">New Leads</div>
              <div className="stat-value">{leadStats.newCount}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Contacted</div>
              <div className="stat-value">{leadStats.contactedCount}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Conversion Rate</div>
              <div className="stat-value">{leadStats.conversionPct}%</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Qualified</div>
              <div className="stat-value">{leadStats.qualifiedCount}</div>
            </div>
          </div>
        </div>

        <div className="leads-card">
          <div className="leads-card-header">
            <h3 className="leads-card-title">Recent Leads</h3>
            <div className="search-container">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={handleSearchChange}
              />
            </div>
          </div>

          <div className="leads-list">
            {loading ? <p className="page-subtitle">Loading leads…</p> : null}
            {loadError && !loading ? (
              <p className="page-subtitle" role="alert">
                {loadError}{' '}
                <button type="button" className="add-lead-btn" onClick={() => void refreshLeads(true)}>
                  Retry
                </button>
              </p>
            ) : null}
            {!loading && !loadError && filteredLeads.length === 0 ? (
              <p className="page-subtitle">No leads yet.</p>
            ) : null}
            {!loading &&
              !loadError &&
              filteredLeads.map((lead) => (
              <div key={lead.id} className="lead-item">
                <div className="lead-info">
                  <div className="lead-avatar">{lead.avatar}</div>
                  <div className="lead-details">
                    <div className="lead-header">
                      <h4 className="lead-name">{lead.name}</h4>
                      <span className={`status-badge ${lead.status.toLowerCase()}`}>
                        {lead.status}
                      </span>
                      <span className={`priority-badge ${lead.priority.toLowerCase()}`}>
                        {lead.priority}
                      </span>
                    </div>
                    <div className="lead-meta">
                      {lead.vehicle} • {lead.email}{lead.score > 0 ? ` • Score: ${lead.score}/100` : ''}
                    </div>
                  </div>
                </div>
                <div className="lead-actions">
                  <button className="action-btn call" onClick={() => handleCallLead(lead)}>
                    <Phone size={14} />
                    <span>Call</span>
                  </button>
                  <button className="action-btn email" onClick={() => handleEmailLead(lead)}>
                    <Mail size={14} />
                    <span>Email</span>
                  </button>
                  <button className="action-btn manage" onClick={() => handleManageLead(lead)}>
                    <Settings size={14} />
                    <span>Manage</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={handleCloseAddModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={handleCloseAddModal}>
              <X size={14} />
            </button>
            <div className="modal-header">
              <h2>Add New Lead</h2>
              <p>Add a new customer inquiry to your leads pipeline</p>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-column">
                  <div className="form-section">
                    <h3>Customer Information</h3>
                    <p>Capture essential customer contact details and communication preferences</p>
                  </div>
                  <div className="form-group">
                    <label>Customer Name *</label>
                    <input
                      type="text"
                      placeholder="Enter full customer name"
                      value={newLeadName}
                      onChange={(event) => setNewLeadName(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      placeholder="customer@example.com"
                      value={newLeadEmail}
                      onChange={(event) => setNewLeadEmail(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+974 5555 1234"
                      value={newLeadPhone}
                      onChange={(event) => setNewLeadPhone(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Lead Source</label>
                    <select value={newLeadSource} onChange={(event) => setNewLeadSource(event.target.value)}>
                      <option value="Website">Website</option>
                      <option value="Referral">Referral</option>
                      <option value="Social Media">Social Media</option>
                    </select>
                  </div>
                </div>
                <div className="form-column">
                  <div className="form-section">
                    <h3>Lead Details</h3>
                    <p>Manage vehicle interest, priority level, and lead status</p>
                  </div>
                  <div className="form-group">
                    <label>Interested Vehicle</label>
                    <select value={newLeadVehicle} onChange={(event) => setNewLeadVehicle(event.target.value)}>
                      <option value="">Select interested vehicle</option>
                      {vehicleOptions.map((v) => (
                        <option key={v.id} value={v.name}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Lead Status</label>
                    <select
                      value={newLeadStatus}
                      onChange={(event) => setNewLeadStatus(event.target.value as typeof newLeadStatus)}
                    >
                      <option value="New">New Lead</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Qualified">Qualified</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Priority Level</label>
                    <select
                      value={newLeadPriority}
                      onChange={(event) => setNewLeadPriority(event.target.value as typeof newLeadPriority)}
                    >
                      <option value="Medium">Medium Priority</option>
                      <option value="High">High Priority</option>
                      <option value="Low">Low Priority</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Additional Notes</label>
                    <textarea 
                      placeholder="Add any additional information about this lead, special requirements, or follow-up reminders..."
                      rows={4}
                      value={newLeadNotes}
                      onChange={(event) => setNewLeadNotes(event.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="lead-summary">
                <h4>Lead Summary Preview</h4>
                <div className="summary-grid">
                  <div className="summary-column">
                    <div className="summary-label">Customer Details</div>
                    <div className="summary-value">{newLeadName.trim() || 'Name not specified'}</div>
                    <div className="summary-value">{newLeadEmail.trim() || 'Email not provided'}</div>
                    {newLeadPhone.trim() && <div className="summary-value">{newLeadPhone}</div>}
                  </div>
                  <div className="summary-column">
                    <div className="summary-label">Vehicle Interest</div>
                    <div className="summary-value">{newLeadVehicle || 'No vehicle selected'}</div>
                    <div className="summary-value">Source: {newLeadSource}</div>
                  </div>
                  <div className="summary-column">
                    <div className="summary-label">Lead Management</div>
                    <div className="summary-value">{newLeadPriority} Priority</div>
                    <div className="summary-value">Status: {newLeadStatus}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <div className="footer-note">* Required fields must be completed</div>
              <div className="footer-actions">
                <button className="btn-secondary" onClick={handleCloseAddModal}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleCreateLead}>
                  <Plus size={14} />
                  <span>Add Lead</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Lead Modal */}
      {showManageModal && selectedLead && (
        <div className="modal-overlay" onClick={handleCloseManageModal}>
          <div className="modal-content manage-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={handleCloseManageModal}>
              <X size={14} />
            </button>
            <div className="modal-header">
              <h2>Manage Lead</h2>
              <p>Update lead information, status, and track interactions</p>
            </div>
            <div className="modal-body">
              <div className="lead-profile">
                <div className="lead-profile-avatar">{selectedLead.avatar}</div>
                <div className="lead-profile-info">
                  <h3>{selectedLead.name}</h3>
                  <div className="lead-profile-contact">
                    <div className="contact-item">
                      <Mail size={14} />
                      <span>{selectedLead.email}</span>
                    </div>
                    <div className="contact-item">
                      <Phone size={14} />
                      <span>{selectedLead.phone || 'No phone'}</span>
                    </div>
                    <div className="contact-item">
                      <Car size={14} />
                      <span>{selectedLead.vehicle}</span>
                    </div>
                    <div className="contact-item">
                      <Settings size={14} />
                      <span>{formatDateOrDash(selectedLead.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Lead Status</label>
                  <select
                    value={manageStatus}
                    onChange={(event) => setManageStatus(event.target.value as typeof manageStatus)}
                  >
                    <option value="New">New Lead</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Qualified">Qualified</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority Level</label>
                  <select
                    value={managePriority}
                    onChange={(event) => setManagePriority(event.target.value as typeof managePriority)}
                  >
                    <option value="High">High Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="Low">Low Priority</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Lead Score (0-100)</label>
                  <input
                    type="number"
                    value={manageScore}
                    onChange={(event) => setManageScore(Number(event.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label>Lead Source</label>
                  <select value={manageSource} onChange={(event) => setManageSource(event.target.value)}>
                    <option value="Website">Website Inquiry</option>
                    <option value="Referral">Referral</option>
                    <option value="Social Media">Social Media</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Notes & Comments</label>
                <textarea
                  placeholder="Add notes about this lead..."
                  rows={3}
                  value={manageNotes}
                  onChange={(event) => setManageNotes(event.target.value)}
                />
              </div>
              <div className="quick-actions">
                <h4>Quick Actions</h4>
                <div className="quick-actions-grid">
                  <button className="quick-action-btn" onClick={() => selectedLead?.phone && window.open(`tel:${selectedLead.phone}`, '_self')}>
                    <Phone size={14} />
                    <span>Call Customer</span>
                  </button>
                  <button className="quick-action-btn" onClick={() => selectedLead?.email && window.open(`mailto:${selectedLead.email}`, '_self')}>
                    <Mail size={14} />
                    <span>Send Email</span>
                  </button>
                  <button className="quick-action-btn" onClick={() => { handleCloseManageModal(); navigate('/requests'); }}>
                    <Check size={14} />
                    <span>View Requests</span>
                  </button>
                  <button className="quick-action-btn danger" onClick={handleDeleteLead}>
                    <Trash2 size={14} />
                    <span>Delete Lead</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={handleCloseManageModal}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveLead}>
                <Check size={14} />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
