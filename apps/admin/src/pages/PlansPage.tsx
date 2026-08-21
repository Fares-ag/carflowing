import type { Plan, PlanTier } from '@carflow/shared'
import { formatCurrency } from '@carflow/shared'
import {
  Check,
  Download,
  LineChart,
  Pencil,
  Plus,
  Search,
  Star,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { InfoModal } from '../components/InfoModal'
import { AdminLayout } from '../layout/AdminLayout'
import { createPlan, deletePlan, getPlanStats, listPlans, updatePlan } from '../services/adminService'
import './PlansPage.css'

export function PlansPage() {
  const navigate = useNavigate()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [planAudience, setPlanAudience] = useState<'dealer' | 'customer'>('dealer')
  const [planName, setPlanName] = useState('')
  const [planMonthly, setPlanMonthly] = useState('')
  const [planYearly, setPlanYearly] = useState('')
  const [featureInput, setFeatureInput] = useState('')
  const [featureList, setFeatureList] = useState<string[]>([])
  const [isPopular, setIsPopular] = useState(false)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null)
  const [deletePlanName, setDeletePlanName] = useState('')
  const [planStats, setPlanStats] = useState<Awaited<ReturnType<typeof getPlanStats>> | null>(null)

  const refreshPlans = () => {
    Promise.all([listPlans(), getPlanStats()])
      .then(([plansData, stats]) => {
        setPlans(plansData)
        setPlanStats(stats)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load plans'))
  }

  const openEditPlan = (planId: string) => {
    const plan = plans.find(item => item.id === planId)
    if (!plan) return
    setPlanName(plan.name)
    setPlanMonthly(String(plan.priceMonthly))
    setPlanYearly(String(plan.priceYearly))
    setFeatureList(plan.features)
    setIsPopular(plan.tier === 'professional')
    setEditingPlanId(planId)
    setShowCreateModal(true)
  }

  useEffect(() => {
    refreshPlans()
  }, [])

  const planCards = useMemo(() => {
    return plans.map((plan) => {
      const description =
        plan.tier === 'starter'
          ? 'Perfect for small dealerships getting started'
          : plan.tier === 'professional'
          ? 'Advanced features for growing dealerships'
          : 'Complete solution for large dealerships'

      return {
        id: plan.id,
        name: plan.name,
        badge: plan.tier === 'professional' ? 'Most Popular' : plan.tier === 'starter' ? 'Best for Beginners' : 'Premium',
        status: plan.status === 'active' ? 'Active' : 'Draft',
        description,
        price: formatCurrency(plan.priceMonthly),
        yearly: `${formatCurrency(plan.priceYearly)}/year`,
        save: '(Save 17%)',
        subscribers: '—',
        revenue: '—',
        features: [
          ...plan.features.map(label => ({ label, enabled: true })),
          { label: 'Custom branding', enabled: plan.tier !== 'starter' },
          { label: 'Priority support', enabled: plan.tier !== 'starter' },
        ],
        editIcon: plan.tier === 'starter' ? <Pencil size={16} /> : <Pencil size={16} />,
        extra: plan.tier === 'professional' ? '+1 more features' : plan.tier === 'enterprise' ? '+2 more features' : null,
        popular: plan.tier === 'professional',
      }
    })
  }, [plans])

  const filteredCards = useMemo(() => {
    let base = planCards
    if (planAudience === 'customer') {
      base = planCards.filter(card => card.name.toLowerCase() !== 'enterprise')
    }
    if (!searchQuery.trim()) return base
    const query = searchQuery.toLowerCase()
    return base.filter(card => card.name.toLowerCase().includes(query))
  }, [planCards, searchQuery, planAudience])

  const handleExport = () => {
    const rows = filteredCards.map(card => ({
      name: card.name,
      status: card.status,
      price: card.price,
      yearly: card.yearly,
      subscribers: card.subscribers,
    }))
    const headers = Object.keys(rows[0] ?? {}) as Array<keyof (typeof rows)[number]>
    const csv = [
      headers.join(','),
      ...rows.map(row => headers.map(header => `"${row[header] ?? ''}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'plans.csv')
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const stats = useMemo(() => {
    const totalPlans = planStats?.totalPlans ?? plans.length
    const activePlans = planStats?.activePlans ?? plans.filter((p) => p.status === 'active').length
    const activeSubscriptions = planStats?.activeSubscriptions ?? 0

    return {
      totalPlans,
      activePlans,
      activeSubscriptions,
    }
  }, [plans, planStats])

  return (
    <AdminLayout title="Plans" subtitle="Subscription plans management">
      <div className="plansPage">
        <div className="plansHeaderRow">
          <p className="plansHeaderHint">Manage subscription plans and pricing strategies</p>
          <div className="plansHeaderActions">
            <button className="plansBtn plansBtn--ghost" type="button" onClick={() => navigate('/analytics')}>
              <LineChart size={16} />
              View Analytics
            </button>
            <button className="plansBtn plansBtn--ghost" type="button" onClick={handleExport}>
              <Download size={16} />
              Export
            </button>
            <button
              className="plansBtn plansBtn--primary"
              type="button"
              onClick={() => {
                setEditingPlanId(null)
                setPlanName('')
                setPlanMonthly('')
                setPlanYearly('')
                setFeatureList([])
                setIsPopular(false)
                setShowCreateModal(true)
              }}
            >
              <Plus size={16} />
              Create Plan
            </button>
          </div>
        </div>

        <div className="plansControls">
          <div className="plansToggle">
            <button
              className={`plansToggleBtn ${planAudience === 'dealer' ? 'plansToggleBtn--active' : ''}`}
              type="button"
              onClick={() => setPlanAudience('dealer')}
            >
              <Users size={16} />
              Dealer Plans
            </button>
            <button
              className={`plansToggleBtn ${planAudience === 'customer' ? 'plansToggleBtn--active' : ''}`}
              type="button"
              onClick={() => setPlanAudience('customer')}
            >
              <Users size={16} />
              Customer Plans
            </button>
          </div>
          <div className="plansSearch">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search plans..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="plansStats">
          <div className="plansStatCard">
            <div className="plansStatTop">
              <div className="plansStatIcon plansStatIcon--blue">
                <Users size={18} />
              </div>
              <div className="plansStatBadge plansStatBadge--blue">{stats.activePlans} Active</div>
            </div>
            <div className="plansStatLabel">Total Plans</div>
            <div className="plansStatValue">{stats.totalPlans}</div>
            <div className="plansStatMeta">Across all categories</div>
          </div>
          <div className="plansStatCard">
            <div className="plansStatTop">
              <div className="plansStatIcon plansStatIcon--purple">
                <Users size={18} />
              </div>
            </div>
            <div className="plansStatLabel">Active Subscriptions</div>
            <div className="plansStatValue">{stats.activeSubscriptions}</div>
            <div className="plansStatMeta">Platform-wide count</div>
          </div>
          <div className="plansStatCard">
            <div className="plansStatTop">
              <div className="plansStatIcon plansStatIcon--green">
                <LineChart size={18} />
              </div>
            </div>
            <div className="plansStatLabel">Plans Shown</div>
            <div className="plansStatValue">{filteredCards.length}</div>
            <div className="plansStatMeta">After filters</div>
          </div>
          <div className="plansStatCard">
            <div className="plansStatTop">
              <div className="plansStatIcon plansStatIcon--orange">
                <TrendingUp size={18} />
              </div>
            </div>
            <div className="plansStatLabel">Per-plan metrics</div>
            <div className="plansStatValue">—</div>
            <div className="plansStatMeta">Not tracked by API yet</div>
          </div>
        </div>

        <div className="plansGrid">
          {filteredCards.map((plan) => (
            <div
              key={plan.id}
              className={`planCard ${plan.popular ? 'planCard--highlight' : ''}`}
            >
              {plan.popular && (
                <div className="planPopularBadge">
                  <TrendingUp size={14} />
                  Popular
                </div>
              )}
              <div className="planHeader">
                <div className="planTitle">
                  <div className={`planIcon planIcon--${plan.name.toLowerCase()}`}>
                    <span />
                  </div>
                  <div>
                    <div className="planName">{plan.name}</div>
                    <div className="planBadge">{plan.badge}</div>
                  </div>
                </div>
                <div className="planStatus">{plan.status}</div>
              </div>
              <div className="planDescription">{plan.description}</div>

              <div className="planPriceBlock">
                <div className="planPrice">
                  {plan.price}
                  <span>/month</span>
                </div>
                <div className="planSave">
                  {plan.yearly} <strong>{plan.save}</strong>
                </div>
              </div>

              <div className="planMiniStats">
                <div className="planMiniStat">
                  <div className="planMiniLabel">
                    <Check size={14} />
                    Subscribers
                  </div>
                  <div className="planMiniValue">{plan.subscribers}</div>
                </div>
                <div className="planMiniStat planMiniStat--amber">
                  <div className="planMiniLabel">
                    <TrendingUp size={14} />
                    Revenue
                  </div>
                  <div className="planMiniValue">{plan.revenue}</div>
                </div>
              </div>

              <div className="planFeatures">
                <div className="planFeaturesTitle">Features</div>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature.label} className={!feature.enabled ? 'is-muted' : ''}>
                      {feature.enabled ? <Check size={14} /> : <X size={14} />}
                      {feature.label}
                    </li>
                  ))}
                </ul>
                {plan.extra && <div className="planFeaturesMore">{plan.extra}</div>}
              </div>

              <div className="planActions">
                <button className="plansBtn plansBtn--ghost" type="button" onClick={() => openEditPlan(plan.id)}>
                  {plan.editIcon}
                  Edit
                </button>
                <button
                  className="plansBtn plansBtn--ghost"
                  type="button"
                  onClick={() => {
                    updatePlan(plan.id, { status: plan.status === 'Active' ? 'archived' : 'active' }).then(() =>
                      refreshPlans()
                    )
                  }}
                >
                  {plan.status === 'Active' ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  className="plansBtn plansBtn--ghost plansBtn--danger"
                  type="button"
                  onClick={() => {
                    setDeletePlanId(plan.id)
                    setDeletePlanName(plan.name)
                  }}
                >
                  <X size={16} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreateModal && (
        <div className="plansModalOverlay" role="dialog" aria-modal="true">
          <div className="plansModal">
            <button
              className="plansModalClose"
              type="button"
              onClick={() => setShowCreateModal(false)}
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="plansModalHeader">
              <h2>{editingPlanId ? 'Edit Plan' : 'Create New Dealer Plan'}</h2>
              <p>{editingPlanId ? 'Update plan details' : 'Set up a new subscription plan with pricing and features'}</p>
            </div>

            <div className="plansModalBody">
              <div className="plansModalSection">
                <div className="plansModalSectionTitle">
                  <span className="plansModalStep">1</span>
                  <h3>Basic Information</h3>
                </div>

                <label className="plansModalFull">
                  Plan Name *
                  <input
                    type="text"
                    placeholder="e.g., Professional"
                    value={planName}
                    onChange={(event) => setPlanName(event.target.value)}
                  />
                </label>

                <div className="plansModalGrid">
                  <label>
                    Monthly Price (QAR) *
                    <input
                      type="text"
                      placeholder="0"
                      value={planMonthly}
                      onChange={(event) => setPlanMonthly(event.target.value)}
                    />
                  </label>
                  <label>
                    Yearly Price (QAR) *
                    <input
                      type="text"
                      placeholder="0"
                      value={planYearly}
                      onChange={(event) => setPlanYearly(event.target.value)}
                    />
                  </label>
                </div>

                <div className="plansModalToggle">
                  <div className="plansModalToggleInfo">
                    <Star size={16} />
                    <div>
                      <div className="plansModalToggleTitle">Mark as Popular</div>
                      <div className="plansModalToggleSub">Highlight this plan to users</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`plansToggleSwitch ${isPopular ? 'is-active' : ''}`}
                    onClick={() => setIsPopular((prev) => !prev)}
                  >
                    <span />
                  </button>
                </div>
              </div>

              <div className="plansModalSection">
                <div className="plansModalSectionTitle">
                  <span className="plansModalStep">2</span>
                  <h3>Plan Features</h3>
                </div>
                <div className="plansModalFeatureRow">
                  <input
                    type="text"
                    placeholder="Feature name"
                    value={featureInput}
                    onChange={(event) => setFeatureInput(event.target.value)}
                  />
                  <button
                    className="plansBtn plansBtn--primary plansBtn--small"
                    type="button"
                    onClick={() => {
                      if (!featureInput.trim()) return
                      setFeatureList((prev) => [...prev, featureInput.trim()])
                      setFeatureInput('')
                    }}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                {featureList.length > 0 && (
                  <div className="plansModalFeatureList">
                    {featureList.map(feature => (
                      <div key={feature} className="plansModalFeatureItem">
                        {feature}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="plansModalFooter">
              <button className="plansBtn plansBtn--ghost" type="button" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button
                className="plansBtn plansBtn--primary"
                type="button"
                onClick={() => {
                  const monthly = Number(planMonthly) || 0
                  const yearly = Number(planYearly) || 0
                  const tier: PlanTier = isPopular
                    ? 'professional'
                    : monthly <= 50
                    ? 'starter'
                    : monthly <= 150
                    ? 'professional'
                    : 'enterprise'
                  const planData = {
                    name: planName.trim() || 'New Plan',
                    tier,
                    status: 'active' as const,
                    priceMonthly: monthly || 49,
                    priceYearly: yearly || 499,
                    features: featureList.length ? featureList : ['Standard access'],
                  }
                  const action = editingPlanId
                    ? updatePlan(editingPlanId, planData)
                    : createPlan(planData)
                  action
                    .then(() => {
                      setEditingPlanId(null)
                      setPlanName('')
                      setPlanMonthly('')
                      setPlanYearly('')
                      setFeatureList([])
                      setIsPopular(false)
                      setShowCreateModal(false)
                      refreshPlans()
                    })
                    .catch((err) =>
                      toast.error(err instanceof Error ? err.message : 'Failed to save plan')
                    )
                }}
              >
                {editingPlanId ? 'Save Changes' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
      <InfoModal
        open={!!deletePlanId}
        title="Delete plan?"
        message={`Delete plan "${deletePlanName}"? This cannot be undone.`}
        onClose={() => setDeletePlanId(null)}
        onConfirm={() => {
          if (!deletePlanId) return
          deletePlan(deletePlanId)
            .then(() => {
              setDeletePlanId(null)
              refreshPlans()
            })
            .catch((err) =>
              setInfoModal({
                title: 'Error',
                message: err instanceof Error ? err.message : 'Failed to delete plan',
              })
            )
        }}
        confirmLabel="Delete"
      />
    </AdminLayout>
  )
}
