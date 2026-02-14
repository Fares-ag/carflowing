# Full Functionality Audit (Mock-First)

This document maps current routes/pages to data needs and core behaviors for
admin, dealer, and customer apps. It drives the shared domain model and service
interfaces.

## Admin App

Routes: `/dashboard`, `/cars`, `/customers`, `/rental`, `/dealers`, `/payments`,
`/plans`, `/complaints`, `/messages`, `/analytics`, `/settings`.

### Page Data Needs
- Dashboard
  - KPIs: total revenue, total rentals, active dealers, active users
  - Trend charts: rentals/revenue over time
  - Recent activity: latest rentals, payment alerts, complaints
- Cars
  - Vehicle inventory list with status, pricing, category, availability
  - Filters: category, status, price range, dealer
  - Actions: view, edit, deactivate, feature
- Customers
  - Users list (name, id, contact, join date, rentals, total spent)
  - Verification + status badges
  - Actions: view, edit, suspend/reactivate
- Rental
  - Rental list with customer, vehicle, duration, status, total
  - Filters: status, date range, dealer
  - Actions: view, update status, refund
- Dealers
  - Dealers list with plan, status, revenue, active rentals
  - Actions: approve, suspend, edit plan
- Payments
  - Transactions list with status, type, customer, vehicle, method, amount
  - Filters: status, type, search
- Plans
  - Plans list with pricing tiers and features
  - Actions: create, edit, publish
- Complaints
  - Complaints list with category, priority, status
  - Actions: view, assign, resolve
- Messages
  - Inbox/sent/starred list with users, preview, unread state
  - Actions: compose, reply, archive
- Analytics
  - Cross-platform KPIs and charts (revenue, rentals, customers)
  - Category distribution, top vehicles
- Settings
  - Admin profile + platform settings

### Core Entities
User, Dealer, Vehicle, Rental, Payment, Plan, Complaint, Message, Analytics.

## Dealer App

Routes: `/dashboard`, `/analytics`, `/inventory`, `/leads`, `/notifications`,
`/subscription`, `/settings`.

### Page Data Needs
- Dashboard
  - Dealer KPIs: revenue, active rentals, available vehicles, leads
  - Revenue trend and booking chart
- Analytics
  - Revenue trends, utilization, demographics, booking times
- Inventory
  - Dealer vehicles list with availability, pricing, specs, status
  - Actions: add, edit, archive, publish
- Leads
  - Lead list with stage, source, contact info
  - Actions: add, assign, convert, close
- Notifications
  - Notification feed with read/unread and types
- Subscription & Billing
  - Current plan, usage, payment methods, billing history
  - Actions: manage billing, update payment method
- Settings
  - Business profile, legal/registration, hours, preferences

### Core Entities
DealerProfile, Vehicle, Lead, Notification, Subscription, PaymentMethod,
BillingHistory.

## Customer App

Routes: `/`, `/dashboard`, `/rentals`, `/favorites`, `/requests`, `/billing`.

### Page Data Needs
- Home
  - Vehicle catalog with filters (price, category, availability)
  - Featured vehicles and dealers
- Dashboard
  - Upcoming rentals, recent activity, saved searches
- My Rentals
  - Current/past rentals with status, dates, pricing
  - Actions: view, cancel, extend
- Favorites
  - Saved vehicles list
  - Actions: remove, book
- Requests
  - Booking requests with status and messages
- Subscription & Billing
  - Current plan, usage, invoices, payment methods

### Core Entities
CustomerProfile, Vehicle, Rental, BookingRequest, Subscription, Invoice,
PaymentMethod.

## Shared Cross-App Behaviors
- Auth/session persistence
- Role-based access (admin/dealer/customer)
- Search + filters + pagination
- CRUD actions with optimistic UI
- Loading/empty/error states
