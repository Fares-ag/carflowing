export const USE_MOCK_API =
  typeof import.meta !== 'undefined' && (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_USE_MOCK_API === 'true'
