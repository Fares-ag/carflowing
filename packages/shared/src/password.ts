/**
 * Keep client and API password rules identical.
 * Import from `@carflow/shared/password` in Node (avoids loading UI assets).
 */
export const MIN_PASSWORD_LENGTH = 8

/** Returns an error message, or null if the password is valid. */
export function validatePassword(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number'
  }
  return null
}
