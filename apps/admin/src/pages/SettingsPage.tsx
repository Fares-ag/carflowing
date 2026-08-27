import { useEffect, useMemo, useState } from 'react'

import { SecuritySection } from '../components/SecuritySection'

import { useAuth } from '../contexts/AuthContext'

import { AdminLayout } from '../layout/AdminLayout'

import {
  getAppSettings,
  getBusinessSettings,
  getFeatureFlags,
  updateAppSettings,
  updateBusinessSettings,
  updateFeatureFlags,
  type AdminFeatureFlags,
} from '../services/adminService'

import './SettingsPage.css'

const BUSINESS_DEFAULTS = {
  platformCommissionRate: 0.1,
  billingGraceDays: 3,
  paymentHoldTtlMinutes: 45,
  cancelNoticeDays: 30,
  swapEligibleDays: 30,
  subscriptionDepositAmount: 0,
}

const FLAGS_DEFAULTS: Omit<AdminFeatureFlags, 'updatedAt'> = {
  checkoutEnabled: true,
  onlinePaymentsEnabled: true,
  signupsEnabled: true,
  dealerSignupsEnabled: true,
}

export function SettingsPage() {
  const { session } = useAuth()
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [supportPhone, setSupportPhone] = useState('')
  const [platformCommissionRate, setPlatformCommissionRate] = useState(
    BUSINESS_DEFAULTS.platformCommissionRate
  )
  const [billingGraceDays, setBillingGraceDays] = useState(BUSINESS_DEFAULTS.billingGraceDays)
  const [paymentHoldTtlMinutes, setPaymentHoldTtlMinutes] = useState(
    BUSINESS_DEFAULTS.paymentHoldTtlMinutes
  )
  const [cancelNoticeDays, setCancelNoticeDays] = useState(BUSINESS_DEFAULTS.cancelNoticeDays)
  const [swapEligibleDays, setSwapEligibleDays] = useState(BUSINESS_DEFAULTS.swapEligibleDays)
  const [subscriptionDepositAmount, setSubscriptionDepositAmount] = useState(
    BUSINESS_DEFAULTS.subscriptionDepositAmount
  )
  const [savedBusiness, setSavedBusiness] = useState(BUSINESS_DEFAULTS)
  const [flags, setFlags] = useState(FLAGS_DEFAULTS)
  const [savedFlags, setSavedFlags] = useState(FLAGS_DEFAULTS)
  const [isLoading, setIsLoading] = useState(true)
  const [companyMessage, setCompanyMessage] = useState('')
  const [businessMessage, setBusinessMessage] = useState('')
  const [flagsMessage, setFlagsMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmBusinessOpen, setConfirmBusinessOpen] = useState(false)
  const [confirmFlagsOpen, setConfirmFlagsOpen] = useState(false)
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [savingFlags, setSavingFlags] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([getAppSettings(), getBusinessSettings(), getFeatureFlags()])
      .then(([company, business, featureFlags]) => {
        if (!active) return
        setSettingsId(company.id)
        setCompanyName(company.companyName)
        setSupportEmail(company.supportEmail)
        setSupportPhone(company.supportPhone ?? '')

        const businessState = {
          platformCommissionRate: business.platformCommissionRate,
          billingGraceDays: business.billingGraceDays,
          paymentHoldTtlMinutes: business.paymentHoldTtlMinutes,
          cancelNoticeDays: business.cancelNoticeDays,
          swapEligibleDays: business.swapEligibleDays,
          subscriptionDepositAmount: business.subscriptionDepositAmount,
        }
        setPlatformCommissionRate(businessState.platformCommissionRate)
        setBillingGraceDays(businessState.billingGraceDays)
        setPaymentHoldTtlMinutes(businessState.paymentHoldTtlMinutes)
        setCancelNoticeDays(businessState.cancelNoticeDays)
        setSwapEligibleDays(businessState.swapEligibleDays)
        setSubscriptionDepositAmount(businessState.subscriptionDepositAmount)
        setSavedBusiness(businessState)

        const nextFlags = {
          checkoutEnabled: featureFlags.checkoutEnabled,
          onlinePaymentsEnabled: featureFlags.onlinePaymentsEnabled,
          signupsEnabled: featureFlags.signupsEnabled,
          dealerSignupsEnabled: featureFlags.dealerSignupsEnabled,
        }
        setFlags(nextFlags)
        setSavedFlags(nextFlags)
        setIsLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unable to load settings')
        setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const businessDraft = useMemo(
    () => ({
      platformCommissionRate,
      billingGraceDays,
      paymentHoldTtlMinutes,
      cancelNoticeDays,
      swapEligibleDays,
      subscriptionDepositAmount,
    }),
    [
      platformCommissionRate,
      billingGraceDays,
      paymentHoldTtlMinutes,
      cancelNoticeDays,
      swapEligibleDays,
      subscriptionDepositAmount,
    ]
  )

  const businessChanged = useMemo(
    () => JSON.stringify(businessDraft) !== JSON.stringify(savedBusiness),
    [businessDraft, savedBusiness]
  )

  const flagsChanged = useMemo(
    () => JSON.stringify(flags) !== JSON.stringify(savedFlags),
    [flags, savedFlags]
  )

  const disablingFlags = useMemo(
    () =>
      (Object.keys(flags) as Array<keyof typeof flags>).some(
        (key) => savedFlags[key] && !flags[key]
      ),
    [flags, savedFlags]
  )

  const handleSaveCompany = async () => {
    if (!settingsId) return
    setCompanyMessage('')
    setError('')
    try {
      await updateAppSettings({
        companyName,
        supportEmail,
        supportPhone: supportPhone || undefined,
      })
      setCompanyMessage('Company settings updated.')
      window.setTimeout(() => setCompanyMessage(''), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save company settings')
    }
  }

  const handleSaveBusiness = async () => {
    setSavingBusiness(true)
    setBusinessMessage('')
    setError('')
    try {
      const updated = await updateBusinessSettings(businessDraft)
      const next = {
        platformCommissionRate: updated.platformCommissionRate,
        billingGraceDays: updated.billingGraceDays,
        paymentHoldTtlMinutes: updated.paymentHoldTtlMinutes,
        cancelNoticeDays: updated.cancelNoticeDays,
        swapEligibleDays: updated.swapEligibleDays,
        subscriptionDepositAmount: updated.subscriptionDepositAmount,
      }
      setSavedBusiness(next)
      setPlatformCommissionRate(next.platformCommissionRate)
      setBillingGraceDays(next.billingGraceDays)
      setPaymentHoldTtlMinutes(next.paymentHoldTtlMinutes)
      setCancelNoticeDays(next.cancelNoticeDays)
      setSwapEligibleDays(next.swapEligibleDays)
      setSubscriptionDepositAmount(next.subscriptionDepositAmount)
      setConfirmBusinessOpen(false)
      setBusinessMessage('Business rules updated — new calculations use these values immediately.')
      window.setTimeout(() => setBusinessMessage(''), 3500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save business rules')
    } finally {
      setSavingBusiness(false)
    }
  }

  const handleSaveFlags = async () => {
    setSavingFlags(true)
    setFlagsMessage('')
    setError('')
    try {
      const updated = await updateFeatureFlags(flags)
      const next = {
        checkoutEnabled: updated.checkoutEnabled,
        onlinePaymentsEnabled: updated.onlinePaymentsEnabled,
        signupsEnabled: updated.signupsEnabled,
        dealerSignupsEnabled: updated.dealerSignupsEnabled,
      }
      setFlags(next)
      setSavedFlags(next)
      setConfirmFlagsOpen(false)
      setFlagsMessage('Kill switches updated — changes apply within ~30 seconds.')
      window.setTimeout(() => setFlagsMessage(''), 3500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save kill switches')
    } finally {
      setSavingFlags(false)
    }
  }

  return (
    <AdminLayout title="Settings" subtitle="System preferences, business rules, and kill switches">
      <div className="adminSettings">
        {isLoading ? <div className="adminSettingsLoading">Loading settings...</div> : null}
        {error ? <div className="adminSettingsError">{error}</div> : null}
        {/* Personal 2FA enrolment: independent of the platform settings below,
            and must render even while those are still loading or failed. */}
        <SecuritySection email={session?.email} />
        {!isLoading ? (
          <>
            <div className="adminSettingsCard">
              <h2 className="adminSettingsSectionTitle">Company</h2>
              <div className="adminSettingsRow">
                <label>
                  Company Name
                  <input type="text" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
                </label>
                <label>
                  Support Email
                  <input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} />
                </label>
              </div>
              <div className="adminSettingsRow">
                <label>
                  Support Phone
                  <input type="tel" value={supportPhone} onChange={(event) => setSupportPhone(event.target.value)} />
                </label>
              </div>
              <div className="adminSettingsActions">
                <button type="button" className="adminSettingsButton" onClick={handleSaveCompany}>
                  Save company
                </button>
                {companyMessage ? <span className="adminSettingsMessage">{companyMessage}</span> : null}
              </div>
            </div>

            <div className="adminSettingsCard">
              <h2 className="adminSettingsSectionTitle">Business rules</h2>
              <p className="adminSettingsHint">
                Effective values shown below. Changes apply to new billing calculations immediately and do not
                alter existing commission ledger rows.
              </p>
              <div className="adminSettingsRow">
                <label>
                  Platform commission rate (0–1)
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={platformCommissionRate}
                    onChange={(event) => setPlatformCommissionRate(Number(event.target.value))}
                  />
                </label>
                <label>
                  Billing grace days
                  <input
                    type="number"
                    min={0}
                    max={365}
                    step={1}
                    value={billingGraceDays}
                    onChange={(event) => setBillingGraceDays(Number(event.target.value))}
                  />
                </label>
                <label>
                  Payment hold TTL (minutes)
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    step={1}
                    value={paymentHoldTtlMinutes}
                    onChange={(event) => setPaymentHoldTtlMinutes(Number(event.target.value))}
                  />
                </label>
              </div>
              <div className="adminSettingsRow">
                <label>
                  Cancel notice days
                  <input
                    type="number"
                    min={0}
                    max={365}
                    step={1}
                    value={cancelNoticeDays}
                    onChange={(event) => setCancelNoticeDays(Number(event.target.value))}
                  />
                </label>
                <label>
                  Swap eligible days
                  <input
                    type="number"
                    min={0}
                    max={365}
                    step={1}
                    value={swapEligibleDays}
                    onChange={(event) => setSwapEligibleDays(Number(event.target.value))}
                  />
                </label>
                <label>
                  Subscription deposit (QAR)
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={subscriptionDepositAmount}
                    onChange={(event) => setSubscriptionDepositAmount(Number(event.target.value))}
                  />
                </label>
              </div>
              <div className="adminSettingsActions">
                <button
                  type="button"
                  className="adminSettingsButton adminSettingsButton--danger"
                  disabled={!businessChanged || savingBusiness}
                  onClick={() => setConfirmBusinessOpen(true)}
                >
                  Save business rules
                </button>
                {businessMessage ? <span className="adminSettingsMessage">{businessMessage}</span> : null}
              </div>
            </div>

            <div className="adminSettingsCard adminSettingsCard--danger">
              <h2 className="adminSettingsSectionTitle">Kill switches</h2>
              <p className="adminSettingsHint adminSettingsHint--danger">
                Use during incidents to pause customer-facing flows without redeploying. Existing rentals,
                invoices, and background jobs keep running.
              </p>
              <div className="adminSettingsToggles">
                <label className="adminSettingsToggle">
                  <input
                    type="checkbox"
                    checked={flags.checkoutEnabled}
                    onChange={(event) => setFlags((current) => ({ ...current, checkoutEnabled: event.target.checked }))}
                  />
                  Checkout &amp; new bookings
                </label>
                <label className="adminSettingsToggle">
                  <input
                    type="checkbox"
                    checked={flags.onlinePaymentsEnabled}
                    onChange={(event) =>
                      setFlags((current) => ({ ...current, onlinePaymentsEnabled: event.target.checked }))
                    }
                  />
                  Online payments (SkipCash)
                </label>
                <label className="adminSettingsToggle">
                  <input
                    type="checkbox"
                    checked={flags.signupsEnabled}
                    onChange={(event) => setFlags((current) => ({ ...current, signupsEnabled: event.target.checked }))}
                  />
                  Customer signups
                </label>
                <label className="adminSettingsToggle">
                  <input
                    type="checkbox"
                    checked={flags.dealerSignupsEnabled}
                    onChange={(event) =>
                      setFlags((current) => ({ ...current, dealerSignupsEnabled: event.target.checked }))
                    }
                  />
                  Dealer signups
                </label>
              </div>
              <div className="adminSettingsActions">
                <button
                  type="button"
                  className="adminSettingsButton adminSettingsButton--danger"
                  disabled={!flagsChanged || savingFlags}
                  onClick={() => setConfirmFlagsOpen(true)}
                >
                  Apply kill switches
                </button>
                {flagsMessage ? <span className="adminSettingsMessage">{flagsMessage}</span> : null}
              </div>
            </div>
          </>
        ) : null}

        {confirmBusinessOpen ? (
          <div className="adminSettingsModalOverlay" role="dialog" aria-modal="true">
            <div className="adminSettingsModal">
              <h3>Confirm business rule changes</h3>
              <p>
                These values affect money: commission on new payments, invoice grace periods, cancellation notice,
                swap timing, deposit on new subscriptions, and payment hold expiry. Existing ledger entries will not
                be recalculated.
              </p>
              <ul className="adminSettingsConfirmList">
                <li>Commission rate: {(platformCommissionRate * 100).toFixed(1)}%</li>
                <li>Billing grace: {billingGraceDays} days</li>
                <li>Payment hold TTL: {paymentHoldTtlMinutes} minutes</li>
                <li>Cancel notice: {cancelNoticeDays} days</li>
                <li>Swap eligible after: {swapEligibleDays} days</li>
                <li>Subscription deposit: {subscriptionDepositAmount} QAR</li>
              </ul>
              <div className="adminSettingsModalActions">
                <button
                  type="button"
                  className="adminSettingsButtonSecondary"
                  disabled={savingBusiness}
                  onClick={() => setConfirmBusinessOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="adminSettingsButton adminSettingsButton--danger"
                  disabled={savingBusiness}
                  onClick={handleSaveBusiness}
                >
                  {savingBusiness ? 'Saving…' : 'Confirm and apply'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {confirmFlagsOpen ? (
          <div className="adminSettingsModalOverlay" role="dialog" aria-modal="true">
            <div className="adminSettingsModal adminSettingsModal--danger">
              <h3>{disablingFlags ? 'Confirm kill switch changes' : 'Apply feature flag changes'}</h3>
              <p>
                {disablingFlags
                  ? 'You are turning off one or more customer-facing flows. Users will see a “temporarily paused” message until you re-enable them.'
                  : 'These toggles control checkout, payments, and signups across all apps.'}
              </p>
              <ul className="adminSettingsConfirmList">
                <li>Checkout &amp; new bookings: {flags.checkoutEnabled ? 'ON' : 'OFF'}</li>
                <li>Online payments: {flags.onlinePaymentsEnabled ? 'ON' : 'OFF'}</li>
                <li>Customer signups: {flags.signupsEnabled ? 'ON' : 'OFF'}</li>
                <li>Dealer signups: {flags.dealerSignupsEnabled ? 'ON' : 'OFF'}</li>
              </ul>
              <div className="adminSettingsModalActions">
                <button
                  type="button"
                  className="adminSettingsButtonSecondary"
                  disabled={savingFlags}
                  onClick={() => setConfirmFlagsOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="adminSettingsButton adminSettingsButton--danger"
                  disabled={savingFlags}
                  onClick={handleSaveFlags}
                >
                  {savingFlags ? 'Applying…' : 'Confirm and apply'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  )
}
