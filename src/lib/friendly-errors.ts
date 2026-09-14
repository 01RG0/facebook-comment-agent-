export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  const lower = msg.toLowerCase()
  if (lower.includes('unauthorized') || lower.includes('not authenticated')) return 'Please sign in again to continue.'
  if (lower.includes('forbidden')) return 'You do not have permission to do that.'
  if (lower.includes('not found') || lower.includes('no rows')) return 'We could not find what you were looking for.'
  if (lower.includes('duplicate') || lower.includes('unique constraint') || lower.includes('already exists')) return 'This already exists. Try a different value.'
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('econnrefused')) return 'Connection error. Check your internet and try again.'
  if (lower.includes('timeout')) return 'The request took too long. Please try again.'
  if (lower.includes('invalid') || lower.includes('required')) return msg.length < 80 ? msg : 'Some required fields are missing or invalid.'
  if (lower.includes('zernio') || lower.includes('facebook') || lower.includes('graph api')) return 'Could not connect to Facebook. Please try again or reconnect your page.'
  if (lower.includes('queue') || lower.includes('redis') || lower.includes('bullmq')) return 'The message is queued and will be processed shortly.'
  if (lower.includes('ai') || lower.includes('gemini') || lower.includes('openai') || lower.includes('mistral')) return 'AI reply generation failed. Check your API key in settings.'
  return 'Something went wrong. Please try again.'
}
