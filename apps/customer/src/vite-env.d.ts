/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API, including /api. Empty in dev (the Vite proxy handles it). */
  readonly VITE_API_URL?: string
  /** 'true' starts the MSW worker instead of talking to the real API. */
  readonly VITE_USE_MOCK_API?: string
  /** 'true' shows the Arabic language toggle. Off until the funnel is translated. */
  readonly VITE_ENABLE_LANGUAGE_TOGGLE?: string
  /** Support phone as it should be displayed. Unset hides every phone/WhatsApp link. */
  readonly VITE_SUPPORT_PHONE?: string
  /** Support mailbox shown on Contact, FAQ and checkout. */
  readonly VITE_SUPPORT_EMAIL?: string
  /** Origin of the dealer app, used by the footer's "List your cars" link. */
  readonly VITE_DEALER_APP_URL?: string
  readonly VITE_SOCIAL_LINKEDIN?: string
  readonly VITE_SOCIAL_FACEBOOK?: string
  readonly VITE_SOCIAL_INSTAGRAM?: string
  readonly VITE_SOCIAL_YOUTUBE?: string
}
