import AiKeysManager from '@/components/ai-keys-manager'

export const metadata = { title: 'AI Keys — FB Comment Agent' }

export default function AiKeysPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Provider Keys</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Manage API keys for AI providers. Keys are tried in priority order — if one fails, the next is used automatically.
        </p>
      </div>
      <AiKeysManager />
    </div>
  )
}
