import { formatCurrency } from '@carflow/shared'
import { useEffect, useState } from 'react'
import { Pencil, Plus, Tag, X } from 'lucide-react'
import { toast } from 'sonner'
import { AdminLayout } from '../layout/AdminLayout'
import {
  createPromoCode,
  disablePromoCode,
  listPromoCodes,
  updatePromoCode,
  type AdminPromoCode,
} from '../services/adminService'
import './PromosPage.css'

type PromoFormState = {
  code: string
  discountType: 'percent' | 'fixed'
  discountValue: string
  minTermMonths: string
  maxUses: string
  perCustomerLimit: string
  firstInvoiceOnly: boolean
  validFrom: string
  validUntil: string
}

const emptyForm = (): PromoFormState => ({
  code: '',
  discountType: 'percent',
  discountValue: '',
  minTermMonths: '1',
  maxUses: '',
  perCustomerLimit: '1',
  firstInvoiceOnly: true,
  validFrom: '',
  validUntil: '',
})

function formFromPromo(promo: AdminPromoCode): PromoFormState {
  return {
    code: promo.code,
    discountType: promo.discountType,
    discountValue: String(promo.discountValue),
    minTermMonths: String(promo.minTermMonths),
    maxUses: promo.maxUses != null ? String(promo.maxUses) : '',
    perCustomerLimit: String(promo.perCustomerLimit),
    firstInvoiceOnly: promo.firstInvoiceOnly,
    validFrom: promo.validFrom ?? '',
    validUntil: promo.validUntil ?? '',
  }
}

export function PromosPage() {
  const [items, setItems] = useState<AdminPromoCode[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AdminPromoCode | null>(null)
  const [form, setForm] = useState<PromoFormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const refresh = () => {
    listPromoCodes()
      .then(setItems)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load promos'))
  }

  useEffect(() => {
    refresh()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (promo: AdminPromoCode) => {
    setEditing(promo)
    setForm(formFromPromo(promo))
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = {
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minTermMonths: Number(form.minTermMonths) || 1,
        maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
        perCustomerLimit: Number(form.perCustomerLimit) || 1,
        firstInvoiceOnly: form.firstInvoiceOnly,
        validFrom: form.validFrom.trim() || null,
        validUntil: form.validUntil.trim() || null,
      }
      if (editing) {
        await updatePromoCode(editing.id, payload)
        toast.success('Promo code updated')
      } else {
        await createPromoCode({ ...payload, code: form.code })
        toast.success('Promo code created')
      }
      closeModal()
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save promo')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (promo: AdminPromoCode) => {
    try {
      if (promo.active) {
        await disablePromoCode(promo.id)
        toast.success('Promo disabled')
      } else {
        await updatePromoCode(promo.id, { active: true })
        toast.success('Promo enabled')
      }
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update promo')
    }
  }

  return (
    <AdminLayout title="Promo Codes" subtitle="Launch discounts with usage limits and redemption tracking">
      <div className="promosPage">
        <div className="promosPageHeader">
          <button type="button" className="promosPrimaryBtn" onClick={openCreate}>
            <Plus size={16} />
            New promo
          </button>
        </div>

        <div className="promosTableWrap">
          <table className="promosTable">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Redemptions</th>
                <th>Remaining</th>
                <th>Scope</th>
                <th>Valid</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="promosEmpty">
                    No promo codes yet. Create one to launch a promotion.
                  </td>
                </tr>
              ) : (
                items.map((promo) => (
                  <tr key={promo.id}>
                    <td>
                      <Tag size={14} aria-hidden />
                      {promo.code}
                    </td>
                    <td>
                      {promo.discountType === 'percent'
                        ? `${promo.discountValue}%`
                        : formatCurrency(promo.discountValue)}
                    </td>
                    <td>
                      {promo.usedCount}
                      {promo.maxUses != null ? ` / ${promo.maxUses}` : ''}
                    </td>
                    <td>{promo.remainingUses != null ? promo.remainingUses : '—'}</td>
                    <td>{promo.firstInvoiceOnly ? 'First invoice' : 'Full term'}</td>
                    <td>
                      {promo.validFrom || promo.validUntil
                        ? `${promo.validFrom ?? '…'} → ${promo.validUntil ?? '…'}`
                        : 'Always'}
                    </td>
                    <td>{promo.active ? 'Active' : 'Disabled'}</td>
                    <td className="promosActions">
                      <button type="button" className="promosLinkBtn" onClick={() => openEdit(promo)}>
                        <Pencil size={14} aria-hidden />
                        Edit
                      </button>
                      <button type="button" className="promosLinkBtn" onClick={() => toggleActive(promo)}>
                        {promo.active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {modalOpen ? (
          <div className="promosOverlay" role="dialog" aria-modal="true" aria-labelledby="promoModalTitle">
            <div className="promosModal">
              <button type="button" className="promosModalClose" onClick={closeModal} aria-label="Close">
                <X size={16} />
              </button>
              <h3 id="promoModalTitle" className="promosModalTitle">
                {editing ? 'Edit promo code' : 'Create promo code'}
              </h3>
              <form className="promosForm" onSubmit={handleSubmit}>
                {!editing ? (
                  <label>
                    Code
                    <input
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                      required
                      placeholder="SUMMER25"
                    />
                  </label>
                ) : null}
                <label>
                  Type
                  <select
                    value={form.discountType}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, discountType: e.target.value as 'percent' | 'fixed' }))
                    }
                  >
                    <option value="percent">Percent</option>
                    <option value="fixed">Fixed (QAR)</option>
                  </select>
                </label>
                <label>
                  Value
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Min term (months)
                  <input
                    type="number"
                    min="1"
                    value={form.minTermMonths}
                    onChange={(e) => setForm((f) => ({ ...f, minTermMonths: e.target.value }))}
                  />
                </label>
                <label>
                  Max uses (optional)
                  <input
                    type="number"
                    min="1"
                    value={form.maxUses}
                    onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                  />
                </label>
                <label>
                  Per customer limit
                  <input
                    type="number"
                    min="1"
                    value={form.perCustomerLimit}
                    onChange={(e) => setForm((f) => ({ ...f, perCustomerLimit: e.target.value }))}
                  />
                </label>
                <label>
                  Valid from
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                  />
                </label>
                <label>
                  Valid until
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                  />
                </label>
                <label className="promosCheckbox">
                  <input
                    type="checkbox"
                    checked={form.firstInvoiceOnly}
                    onChange={(e) => setForm((f) => ({ ...f, firstInvoiceOnly: e.target.checked }))}
                  />
                  Apply to first invoice only
                </label>
                <div className="promosFormActions">
                  <button type="button" className="promosSecondaryBtn" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="promosPrimaryBtn" disabled={submitting}>
                    {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  )
}
