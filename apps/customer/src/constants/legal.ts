/**
 * Legal document skeletons.
 *
 * IMPORTANT — read before editing: none of the copy below is legal text. Every
 * section carries the heading a Qatari consumer marketplace needs (PDPPL
 * Law No. 13 of 2016 for the privacy notice) plus a note describing what a
 * lawyer must put there. The pages render each note inside a visible
 * "PLACEHOLDER — pending legal review" callout precisely so nobody mistakes it
 * for a binding assertion. Replace `body` with reviewed copy, drop the
 * `placeholder` flag on that section, and bump LEGAL_DOCUMENT_VERSION.
 */

/** Matches `consent_records.document_kind` on the API (free text, no migration needed). */
export type LegalDocumentKind = 'terms' | 'privacy' | 'rental_agreement' | 'refund_policy'

/**
 * Recorded in `consent_records.document_version` next to every acceptance.
 * The copy is an un-reviewed skeleton, so the version says so out loud — when
 * reviewed text lands, bump this and every customer is asked to accept again.
 */
export const LEGAL_DOCUMENT_VERSION = '0-draft'

export const LEGAL_ROUTES: Record<LegalDocumentKind, string> = {
  terms: '/terms',
  privacy: '/privacy',
  refund_policy: '/refund-policy',
  rental_agreement: '/rental-agreement',
}

/** Documents accepted when an account is created. */
export const SIGNUP_CONSENT_KINDS: LegalDocumentKind[] = ['terms', 'privacy']

/** Documents accepted when a subscription order is placed at checkout. */
export const CHECKOUT_CONSENT_KINDS: LegalDocumentKind[] = [
  'terms',
  'privacy',
  'rental_agreement',
  'refund_policy',
]

export interface LegalSection {
  heading: string
  /** Placeholder guidance, or reviewed legal copy once `placeholder` is false. */
  body: string
  /** True while the body is drafting guidance rather than binding text. */
  placeholder: boolean
}

export interface LegalDocument {
  kind: LegalDocumentKind
  title: string
  /** Short strapline under the page title. */
  summary: string
  sections: LegalSection[]
}

const placeholder = (heading: string, body: string): LegalSection => ({
  heading,
  body,
  placeholder: true,
})

const TERMS: LegalDocument = {
  kind: 'terms',
  title: 'Terms of Service',
  summary:
    'The agreement between you and CarFlow covering use of this marketplace, subscription orders and payments.',
  sections: [
    placeholder(
      'Who these terms are between',
      'Identify the operating entity: registered legal name, Qatar commercial registration number, registered address, and the trading name customers see. State that using the site means agreeing to these terms.'
    ),
    placeholder(
      'Eligibility and your account',
      'Minimum age, residency and Qatar ID requirements, holding a valid driving licence recognised in Qatar, accuracy of the information supplied, and responsibility for account credentials.'
    ),
    placeholder(
      "CarFlow's role in a subscription",
      'Set out whether CarFlow contracts as principal or as an intermediary between the customer and the dealer supplying the vehicle, and which obligations sit with which party.'
    ),
    placeholder(
      'Placing an order and dealer approval',
      'Explain that a request is an offer, that a dealer must approve it, when a binding contract forms, and what happens if a request is declined after documents are uploaded or payment is taken.'
    ),
    placeholder(
      'Identity and document verification',
      'Why Qatar ID and driving licence copies are required before handover, who reviews them, what happens if verification fails, and how they interact with the privacy notice.'
    ),
    placeholder(
      'Prices, fees and taxes',
      'What the advertised monthly price includes, the deposit, delivery charges, excess-mileage and late-payment fees, and how taxes or government charges are applied.'
    ),
    placeholder(
      'Payments and authorised charges',
      'Billing cycle, first-month charge at checkout, recurring monthly charges, saved-card authority, what happens on a failed payment, and the dunning and suspension steps.'
    ),
    placeholder(
      'Using the vehicle',
      'Permitted use, authorised drivers, geographic limits, prohibited uses, fuel and charging, and the customer duty to report accidents, damage and theft.'
    ),
    placeholder(
      'Insurance, damage and traffic fines',
      'Insurance in place, the excess payable, uninsured events, and how traffic fines, tolls and impound charges incurred during the subscription are passed on.'
    ),
    placeholder(
      'Suspension and termination',
      'Grounds on which either side may suspend or terminate, notice periods, and the consequences for the vehicle, outstanding invoices and the deposit.'
    ),
    placeholder(
      'Liability',
      'Liability caps and exclusions permitted under Qatari law, and the consumer rights that cannot be excluded.'
    ),
    placeholder(
      'Governing law and disputes',
      'Confirm the laws of the State of Qatar govern these terms, name the competent courts or arbitration forum, and describe the complaint route before formal proceedings.'
    ),
    placeholder(
      'Changes to these terms',
      'How changes are notified, the notice period, and what happens to a subscription already running when terms change.'
    ),
    placeholder(
      'Contact',
      'Support channels for questions about these terms and the postal address for formal notices.'
    ),
  ],
}

const PRIVACY: LegalDocument = {
  kind: 'privacy',
  title: 'Privacy Notice',
  summary:
    'How CarFlow collects and uses personal data, and your rights under Qatar Law No. 13 of 2016 on Personal Data Privacy Protection (PDPPL).',
  sections: [
    placeholder(
      'Who controls your personal data',
      'Name the controller: registered legal entity, commercial registration number, registered address in Qatar, and the contact point for privacy matters. Name any joint controller or processor group companies.'
    ),
    placeholder(
      'What personal data we collect',
      'List each category actually collected: account details, phone and email, Qatar ID number and ID copy, driving licence number and copy, date of birth and nationality, billing and delivery address, emergency contact, payment card token and transaction records, vehicle telemetry or location if used, support messages, device and usage data.'
    ),
    placeholder(
      'Why we use your data',
      'State each purpose separately: creating and administering the account, verifying identity and licence eligibility, arranging and delivering a vehicle, billing and collecting subscription payments, fraud and credit checks, fines and damage recovery, customer support, service messages, marketing where consented, and statutory reporting.'
    ),
    placeholder(
      'Our legal basis for processing',
      'Under the PDPPL, map each purpose to its basis: performance of the subscription contract, compliance with a legal obligation, a legitimate purpose of the controller that does not prejudice your rights, or your explicit consent. Identify which data is treated as data of a special nature and the additional permit or safeguard relied on.'
    ),
    placeholder(
      'How long we keep your data',
      'Give a retention period per category — account data, identity documents, invoices and payment records, support tickets, marketing consent evidence — and the accounting, tax or traffic-law obligation that fixes each period, plus what is deleted or anonymised when an account closes.'
    ),
    placeholder(
      'Who we share your data with',
      'Name the recipient categories and why: the dealer supplying the vehicle, the payment processor (SkipCash), insurers, the email/SMS/WhatsApp providers, cloud hosting and storage providers, debt recovery and legal advisers, and government or law-enforcement bodies where required.'
    ),
    placeholder(
      'Transfers outside Qatar',
      'Identify processing that happens outside the State of Qatar, the countries involved, and the safeguards applied to those transfers.'
    ),
    placeholder(
      'How we protect your data',
      'Summarise the organisational and technical measures: access control, encryption in transit and at rest, restricted access to identity documents, retention limits, and the breach-notification process to the competent department and to affected individuals.'
    ),
    placeholder(
      'Your rights',
      'Explain the PDPPL rights and how to use them: to be informed, to access and obtain a copy of your data, to have inaccurate data corrected, to have data erased, to object to processing including for direct marketing, to withdraw consent, and to complain to the competent department at the Ministry. State the response deadline and any identity checks.'
    ),
    placeholder(
      'Children and data of a special nature',
      'State whether the service is offered to minors and the safeguards for data of a special nature (health, ethnic origin, criminal record) if any is processed.'
    ),
    placeholder(
      'Cookies and similar technologies',
      'List the cookies and local storage in use, their purpose and lifetime, which are strictly necessary, and how a visitor controls the rest.'
    ),
    placeholder(
      'Changes to this notice',
      'How updates are published and how material changes are notified to existing customers.'
    ),
    placeholder(
      'How to contact us',
      'The privacy contact address and mailbox, the escalation route, and how to complain to the competent department under the PDPPL.'
    ),
  ],
}

const REFUND_POLICY: LegalDocument = {
  kind: 'refund_policy',
  title: 'Cancellation & Refund Policy',
  summary:
    'When a subscription can be cancelled, what is refundable, and how long a refund takes to reach you.',
  sections: [
    placeholder(
      'What this policy covers',
      'State which payments the policy applies to: the first-month charge taken at checkout, recurring monthly invoices, the refundable deposit, and delivery or add-on fees.'
    ),
    placeholder(
      'Cancelling before handover',
      'The window in which a request can be cancelled before the car is handed over, whether the first-month charge is returned in full, and any administration fee.'
    ),
    placeholder(
      'Cancelling an active subscription',
      'The notice period, how the effective date lands on a billing boundary, whether the minimum term must be served, and any early-termination charge.'
    ),
    placeholder(
      'Refundable deposit',
      'When the deposit is returned, the deductions that may be made (damage, fines, unpaid invoices, excess mileage), and the period for returning the balance.'
    ),
    placeholder(
      'What is not refundable',
      'List clearly: consumed subscription days, delivery or collection fees already incurred, fines and tolls, damage recharges, and any other non-refundable item.'
    ),
    placeholder(
      'How refunds are paid',
      'Confirm refunds go back to the original payment method, the expected working-day window from approval to the money landing, and the currency used.'
    ),
    placeholder(
      'Failed, duplicate and disputed payments',
      'What happens to an authorisation that never completed, how a duplicate charge is identified and returned, and the process to follow before raising a chargeback with your bank.'
    ),
    placeholder(
      'How to request a cancellation or refund',
      'The exact route — the account area, the support channels, the information needed — and the acknowledgement and decision timelines.'
    ),
    placeholder(
      'Contact and escalation',
      'Who to contact if a refund decision is disputed, and the consumer-protection escalation route in Qatar.'
    ),
  ],
}

const RENTAL_AGREEMENT: LegalDocument = {
  kind: 'rental_agreement',
  title: 'Subscription (Rental) Agreement',
  summary:
    'The vehicle-specific agreement you accept at checkout, alongside the Terms of Service.',
  sections: [
    placeholder(
      'Parties and vehicle',
      'Identify the supplying dealer, CarFlow, and the customer, and record the vehicle make, model, year, plate and odometer reading at handover.'
    ),
    placeholder(
      'Term, start date and handover',
      'The minimum term, the start date, how the term rolls on afterwards, and the handover and acceptance procedure including the condition report.'
    ),
    placeholder(
      'Monthly charge and billing cycle',
      'The monthly amount, the billing date, what the charge includes, the grace period before an invoice becomes overdue, and late-payment consequences.'
    ),
    placeholder(
      'Security deposit',
      'Amount, when it is taken, what it secures, and the conditions for its return.'
    ),
    placeholder(
      'Permitted use and authorised drivers',
      'Who may drive, licence requirements, personal versus commercial use, sub-letting and ride-hailing restrictions, and geographic limits including travel outside Qatar.'
    ),
    placeholder(
      'Mileage allowance',
      'The included monthly mileage, how excess kilometres are measured and charged, and how the odometer is verified.'
    ),
    placeholder(
      'Maintenance, servicing and assistance',
      'What is included, the customer duty to present the vehicle for scheduled service, how a replacement vehicle is provided, and how roadside assistance is called.'
    ),
    placeholder(
      'Insurance, excess and liability',
      'The policy in place, who is insured, the excess payable per claim, what voids cover, and liability for uninsured loss.'
    ),
    placeholder(
      'Traffic fines, tolls and penalties',
      'How fines are traced to the customer, the administration fee charged for processing them, and the payment deadline.'
    ),
    placeholder(
      'Damage, loss and theft',
      'The reporting deadline, the police report requirement, how repair costs are assessed and recharged, and what happens if the vehicle is written off or stolen.'
    ),
    placeholder(
      'Swaps, pauses and extensions',
      'Eligibility windows, notice required, price changes on a swap, and the effect of a pause on billing and on the minimum term.'
    ),
    placeholder(
      'Cancellation and returning the vehicle',
      'Notice period, the return appointment, the condition standard expected, cleaning and fuel/charge rules, and the return inspection.'
    ),
    placeholder(
      'Default and repossession',
      'The events of default, the notice given, and the circumstances in which the vehicle may be recovered.'
    ),
    placeholder(
      'Governing law',
      'Confirm the agreement is governed by the laws of the State of Qatar and name the competent forum for disputes.'
    ),
    placeholder(
      'Acceptance',
      'Describe how acceptance is recorded — the tick box at checkout, the document version, and the timestamp stored against the account — and how a copy can be obtained.'
    ),
  ],
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentKind, LegalDocument> = {
  terms: TERMS,
  privacy: PRIVACY,
  refund_policy: REFUND_POLICY,
  rental_agreement: RENTAL_AGREEMENT,
}
