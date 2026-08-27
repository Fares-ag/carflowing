/**
 * Social profiles shown in the footer.
 *
 * Configured per environment: the footer previously linked every icon at the
 * network's own homepage (linkedin.com, facebook.com, …), which reads as a
 * broken profile link. Anything left unset is simply not rendered.
 */
export type SocialNetwork = 'linkedin' | 'facebook' | 'instagram' | 'youtube'

export interface SocialLink {
  network: SocialNetwork
  label: string
  url: string
}

const CONFIGURED: Array<{ network: SocialNetwork; label: string; url: string }> = [
  { network: 'linkedin', label: 'LinkedIn', url: import.meta.env.VITE_SOCIAL_LINKEDIN ?? '' },
  { network: 'facebook', label: 'Facebook', url: import.meta.env.VITE_SOCIAL_FACEBOOK ?? '' },
  { network: 'instagram', label: 'Instagram', url: import.meta.env.VITE_SOCIAL_INSTAGRAM ?? '' },
  { network: 'youtube', label: 'YouTube', url: import.meta.env.VITE_SOCIAL_YOUTUBE ?? '' },
]

export const SOCIAL_LINKS: SocialLink[] = CONFIGURED.filter((link) => link.url.trim().length > 0).map(
  (link) => ({ ...link, url: link.url.trim() })
)
