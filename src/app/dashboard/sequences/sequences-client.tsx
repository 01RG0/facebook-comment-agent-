'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  GitMerge,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  Send,
  Loader2,
  Play,
  Pause,
  AlertCircle,
  X,
  Users,
  Layers,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface SequenceStep {
  id?: string
  step_number: number
  delay_hours: number
  message_template: string
}

interface SequenceEnrollment {
  id: string
  contact_id: string
  current_step: number
  next_step_at: string | null
  status: string
  enrolled_at: string
  contacts?: {
    id: string
    name: string | null
    picture: string | null
    platform_user_id: string
  } | null
}

interface Sequence {
  id: string
  user_id: string
  page_id: string | null
  name: string
  is_active: boolean
  trigger: 'comment_replied' | 'dm_sent' | string
  created_at: string
  sequence_steps?: Array<{ count: number }> | SequenceStep[]
  sequence_enrollments?: Array<{ count: number }> | SequenceEnrollment[]
}

interface PageOption {
  id: string
  page_name: string
}

export default function SequencesClient() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [pages, setPages] = useState<PageOption[]>([])
  const [loading, setLoading] = useState(true)

  // Creation form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formName, setFormName] = useState('')
  const [formPageId, setFormPageId] = useState('')
  const [formTrigger, setFormTrigger] = useState<'comment_replied' | 'dm_sent'>('comment_replied')
  const [formSteps, setFormSteps] = useState<Array<{ delay_hours: number; message_template: string }>>([
    { delay_hours: 24, message_template: '' },
  ])

  // Expanded card details: id -> detailed sequence data
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedLoading, setExpandedLoading] = useState(false)
  const [expandedData, setExpandedData] = useState<Record<string, { steps: SequenceStep[]; enrollments: SequenceEnrollment[] }>>({})

  // Fetch sequences list
  const fetchSequences = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/sequences')
      if (!res.ok) throw new Error('Failed to load sequences')
      const data = await res.json()
      setSequences(data.sequences || [])
    } catch (err: any) {
      toast.error(err.message || 'Error fetching sequences')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch pages for dropdown
  useEffect(() => {
    fetchSequences()
    fetch('/api/pages')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setPages(data)
          if (data.length > 0) setFormPageId(data[0].id)
        }
      })
      .catch(() => {})
  }, [fetchSequences])

  // Toggle sequence active status
  const handleToggleActive = async (seq: Sequence) => {
    const newStatus = !seq.is_active
    // Optimistic update
    setSequences((prev) =>
      prev.map((s) => (s.id === seq.id ? { ...s, is_active: newStatus } : s))
    )

    try {
      const res = await fetch(`/api/sequences/${seq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus }),
      })
      if (!res.ok) throw new Error('Failed to update sequence')
      toast.success(newStatus ? 'Sequence activated' : 'Sequence paused')
    } catch (err: any) {
      toast.error(err.message || 'Error updating status')
      fetchSequences()
    }
  }

  // Delete sequence
  const handleDeleteSequence = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete sequence "${name}"?`)) return

    try {
      const res = await fetch(`/api/sequences/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete sequence')
      toast.success('Sequence deleted')
      setSequences((prev) => prev.filter((s) => s.id !== id))
      if (expandedId === id) setExpandedId(null)
    } catch (err: any) {
      toast.error(err.message || 'Error deleting sequence')
    }
  }

  // Load details when expanding
  const handleToggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }

    setExpandedId(id)
    if (!expandedData[id]) {
      setExpandedLoading(true)
      try {
        const res = await fetch(`/api/sequences/${id}`)
        if (!res.ok) throw new Error('Failed to fetch details')
        const data = await res.json()
        const seq = data.sequence
        setExpandedData((prev) => ({
          ...prev,
          [id]: {
            steps: seq.sequence_steps || [],
            enrollments: seq.sequence_enrollments || [],
          },
        }))
      } catch (err: any) {
        toast.error(err.message || 'Error loading sequence details')
      } finally {
        setExpandedLoading(false)
      }
    }
  }

  // Step builder helpers
  const handleAddStep = () => {
    setFormSteps((prev) => [...prev, { delay_hours: 24, message_template: '' }])
  }

  const handleRemoveStep = (index: number) => {
    if (formSteps.length <= 1) return
    setFormSteps((prev) => prev.filter((_, i) => i !== index))
  }

  const handleStepChange = (index: number, field: 'delay_hours' | 'message_template', value: any) => {
    setFormSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, [field]: value } : step))
    )
  }

  // Create sequence
  const handleCreateSequence = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) {
      toast.error('Please enter a sequence name')
      return
    }

    // Validate steps
    for (let i = 0; i < formSteps.length; i++) {
      if (!formSteps[i].message_template.trim()) {
        toast.error(`Please provide a message template for Step ${i + 1}`)
        return
      }
    }

    setCreating(true)
    try {
      const payload = {
        name: formName.trim(),
        page_id: formPageId || null,
        trigger: formTrigger,
        steps: formSteps.map((step, idx) => ({
          step_number: idx + 1,
          delay_hours: Number(step.delay_hours) || 24,
          message_template: step.message_template.trim(),
        })),
      }

      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to create sequence')
      }

      toast.success('Sequence created successfully!')
      setShowCreateForm(false)
      setFormName('')
      setFormSteps([{ delay_hours: 24, message_template: '' }])
      fetchSequences()
    } catch (err: any) {
      toast.error(err.message || 'Error creating sequence')
    } finally {
      setCreating(false)
    }
  }

  // Helper to get step/enrollment count from sequence object
  const getStepCount = (seq: Sequence): number => {
    if (!seq.sequence_steps) return 0
    if (Array.isArray(seq.sequence_steps) && seq.sequence_steps.length > 0) {
      const first: any = seq.sequence_steps[0]
      if (typeof first?.count === 'number') return first.count
      return seq.sequence_steps.length
    }
    return 0
  }

  const getEnrollmentCount = (seq: Sequence): number => {
    if (!seq.sequence_enrollments) return 0
    if (Array.isArray(seq.sequence_enrollments) && seq.sequence_enrollments.length > 0) {
      const first: any = seq.sequence_enrollments[0]
      if (typeof first?.count === 'number') return first.count
      return seq.sequence_enrollments.length
    }
    return 0
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
            <GitMerge className="w-6 h-6 text-indigo-500" />
            Sequences
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Automated multi-step follow-ups after comment replies or DMs.
          </p>
        </div>

        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            New Sequence
          </button>
        )}
      </div>

      {/* Inline Creation Panel */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateSequence}
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 md:p-6 shadow-sm space-y-6 transition-all"
        >
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-4">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-500" />
              Create New Follow-Up Sequence
            </h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Sequence Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Sequence Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 3-Day Lead Nurture"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* Page Selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Facebook Page
              </label>
              <select
                value={formPageId}
                onChange={(e) => setFormPageId(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">All Connected Pages</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.page_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Trigger Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Trigger Event
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={cn(
                  'flex items-center gap-3 p-3.5 border rounded-lg cursor-pointer transition-all',
                  formTrigger === 'comment_replied'
                    ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 text-neutral-900 dark:text-white'
                    : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400'
                )}
              >
                <input
                  type="radio"
                  name="trigger"
                  value="comment_replied"
                  checked={formTrigger === 'comment_replied'}
                  onChange={() => setFormTrigger('comment_replied')}
                  className="text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <div className="text-sm font-medium">After comment replied</div>
                  <div className="text-xs text-neutral-500">Triggers when an AI reply is posted on comment</div>
                </div>
              </label>

              <label
                className={cn(
                  'flex items-center gap-3 p-3.5 border rounded-lg cursor-pointer transition-all',
                  formTrigger === 'dm_sent'
                    ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 text-neutral-900 dark:text-white'
                    : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400'
                )}
              >
                <input
                  type="radio"
                  name="trigger"
                  value="dm_sent"
                  checked={formTrigger === 'dm_sent'}
                  onChange={() => setFormTrigger('dm_sent')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-medium">After DM sent</div>
                  <div className="text-xs text-neutral-500">Triggers when a private message or DM is sent</div>
                </div>
              </label>
            </div>
          </div>

          {/* Steps Builder */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-neutral-900 dark:text-white">
                Sequence Steps ({formSteps.length})
              </label>
              <button
                type="button"
                onClick={handleAddStep}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Step
              </button>
            </div>

            <div className="space-y-3">
              {formSteps.map((step, index) => (
                <div
                  key={index}
                  className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-neutral-50/50 dark:bg-neutral-800/30 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <span>Step {index + 1}</span>
                    </div>

                    {formSteps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(index)}
                        className="text-neutral-400 hover:text-rose-500 p-1 transition-colors"
                        title="Remove step"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                    <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
                    <span>Wait</span>
                    <input
                      type="number"
                      min="1"
                      max="720"
                      value={step.delay_hours}
                      onChange={(e) =>
                        handleStepChange(index, 'delay_hours', Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-20 px-2 py-1 text-center bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span>hours then send:</span>
                  </div>

                  <div>
                    <textarea
                      required
                      rows={2}
                      placeholder="Write your follow-up message template..."
                      value={step.message_template}
                      onChange={(e) => handleStepChange(index, 'message_template', e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Sequence
            </button>
          </div>
        </form>
      )}

      {/* Sequences List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-neutral-500 dark:text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
          <p className="text-sm">Loading sequences...</p>
        </div>
      ) : sequences.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-neutral-300 dark:border-neutral-800 rounded-2xl bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center mx-auto mb-3">
            <GitMerge className="w-6 h-6 text-indigo-500" />
          </div>
          <h3 className="text-base font-medium text-neutral-900 dark:text-white mb-1">
            No sequences yet
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto mb-4">
            Build automated multi-step outreach to stay in touch with commenters.
          </p>
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create your first sequence
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {sequences.map((seq) => {
            const isExpanded = expandedId === seq.id
            const stepCount = getStepCount(seq)
            const enrollmentCount = getEnrollmentCount(seq)
            const details = expandedData[seq.id]

            return (
              <div
                key={seq.id}
                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm transition-all"
              >
                {/* Main Card Row */}
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-semibold text-base text-neutral-900 dark:text-white truncate">
                        {seq.name}
                      </h3>

                      {/* Trigger Badge */}
                      {seq.trigger === 'comment_replied' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50">
                          After comment replied
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50">
                          After DM sent
                        </span>
                      )}

                      {/* Chips */}
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                        <Layers className="w-3 h-3" />
                        {stepCount} {stepCount === 1 ? 'step' : 'steps'}
                      </span>

                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                        <Users className="w-3 h-3" />
                        {enrollmentCount} enrolled
                      </span>
                    </div>

                    <div className="text-xs text-neutral-400">
                      Created {formatDistanceToNow(new Date(seq.created_at), { addSuffix: true })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggleActive(seq)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        seq.is_active
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700'
                      )}
                      title={seq.is_active ? 'Pause sequence' : 'Activate sequence'}
                    >
                      {seq.is_active ? (
                        <>
                          <Play className="w-3 h-3 fill-current" />
                          Active
                        </>
                      ) : (
                        <>
                          <Pause className="w-3 h-3 fill-current" />
                          Paused
                        </>
                      )}
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteSequence(seq.id, seq.name)}
                      className="p-1.5 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                      title="Delete sequence"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Expand button */}
                    <button
                      onClick={() => handleToggleExpand(seq.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors border border-neutral-200 dark:border-neutral-800"
                    >
                      {isExpanded ? 'Hide Details' : 'View Details'}
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 p-5 space-y-6">
                    {expandedLoading && !details ? (
                      <div className="flex items-center justify-center py-8 text-neutral-400 text-sm">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Loading details...
                      </div>
                    ) : (
                      <>
                        {/* Steps list */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            Sequence Schedule
                          </h4>

                          {details?.steps && details.steps.length > 0 ? (
                            <div className="space-y-2">
                              {details.steps.map((step) => (
                                <div
                                  key={step.id || step.step_number}
                                  className="flex items-start gap-3 p-3 bg-white dark:bg-neutral-800/80 rounded-lg border border-neutral-200/80 dark:border-neutral-700/60 text-sm"
                                >
                                  <span className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                                    {step.step_number}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                                      Step {step.step_number}: Wait {step.delay_hours} hours →
                                    </div>
                                    <div className="text-neutral-900 dark:text-neutral-100 font-normal mt-0.5">
                                      {step.message_template.length > 80
                                        ? `${step.message_template.slice(0, 80)}...`
                                        : step.message_template || '(Empty message)'}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-neutral-400">No steps defined.</p>
                          )}
                        </div>

                        {/* Enrolled contacts list */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            Enrolled Contacts ({details?.enrollments?.length || 0})
                          </h4>

                          {details?.enrollments && details.enrollments.length > 0 ? (
                            <div className="bg-white dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/60 rounded-lg overflow-hidden">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-neutral-600 dark:text-neutral-300">
                                  <thead className="bg-neutral-50 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">
                                    <tr>
                                      <th className="px-4 py-2.5">Contact</th>
                                      <th className="px-4 py-2.5">Enrolled</th>
                                      <th className="px-4 py-2.5">Current Step</th>
                                      <th className="px-4 py-2.5">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                                    {details.enrollments.map((enr) => (
                                      <tr key={enr.id}>
                                        <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                                          {enr.contacts?.name || enr.contacts?.platform_user_id || 'Unknown Contact'}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-400">
                                          {formatDistanceToNow(new Date(enr.enrolled_at), { addSuffix: true })}
                                        </td>
                                        <td className="px-4 py-3">Step {enr.current_step}</td>
                                        <td className="px-4 py-3">
                                          <span
                                            className={cn(
                                              'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium capitalize',
                                              enr.status === 'active'
                                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
                                            )}
                                          >
                                            {enr.status}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-neutral-400 italic">No contacts enrolled yet.</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
