import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const BLOCKED_HOSTNAME_PATTERNS = [
  /^127\./,           // loopback
  /^10\./,            // RFC-1918
  /^172\.(1[6-9]|2\d|3[01])\./,  // RFC-1918
  /^192\.168\./,      // RFC-1918
  /^169\.254\./,      // link-local (AWS/GCP metadata)
  /^0\.0\.0\.0/,
  /^::1$/,            // IPv6 loopback
  /^fd[0-9a-f]{2}:/i, // IPv6 ULA
  /^fe80:/i,          // IPv6 link-local
]

// Validate that a user-supplied base URL is a safe external HTTPS endpoint.
// Throws if the URL is non-HTTPS or points to a private/internal address.
export function validateExternalUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed for external AI providers')
  }
  const h = parsed.hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new Error(`URL hostname "${h}" is not allowed`)
  }
  if (BLOCKED_HOSTNAME_PATTERNS.some(re => re.test(h))) {
    throw new Error(`URL hostname "${h}" is not allowed (private/reserved range)`)
  }
}
