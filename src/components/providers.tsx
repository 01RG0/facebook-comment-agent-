'use client'

import { SWRConfig } from 'swr'

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
})

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{
      fetcher,
      revalidateOnFocus: false,       // don't refetch when tab regains focus
      revalidateOnReconnect: false,   // don't refetch on reconnect
      dedupingInterval: 30_000,       // deduplicate requests within 30s
      errorRetryCount: 2,
      keepPreviousData: true,         // show stale data while revalidating
    }}>
      {children}
    </SWRConfig>
  )
}
