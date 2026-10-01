import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { logger } from '@/lib/logger'

export async function middleware(request: NextRequest) {
  const start = Date.now()
  const pathname = request.nextUrl.pathname
  const isApi = pathname.startsWith('/api/')

  const response = await updateSession(request)

  if (isApi) {
    const durationMs = Date.now() - start
    const status = response.status
    const logData = { method: request.method, path: pathname, status, durationMs }
    if (durationMs > 500) {
      logger.warn(logData, 'Slow API request')
    } else {
      logger.info(logData, 'API request')
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
