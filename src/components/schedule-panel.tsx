'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Clock, Plus, Trash2, Loader2 } from 'lucide-react'

interface ScheduleSlot {
  days: number[]
  start: string
  end: string
}

interface SchedulePanelProps {
  pageId: string
  initialSettings: {
    schedule_enabled?: boolean
    schedule_timezone?: string
    schedule_slots?: ScheduleSlot[]
  } | null
}

const DAY_LABELS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const DAY_SHORT = ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب']

const COMMON_TIMEZONES = [
  { value: 'Africa/Cairo', label: 'القاهرة (EET)' },
  { value: 'Asia/Riyadh', label: 'الرياض (AST)' },
  { value: 'Asia/Dubai', label: 'دبي (GST)' },
  { value: 'Asia/Kuwait', label: 'الكويت (AST)' },
  { value: 'Asia/Baghdad', label: 'بغداد (AST)' },
  { value: 'Africa/Casablanca', label: 'الدار البيضاء (WET)' },
  { value: 'Africa/Tunis', label: 'تونس (CET)' },
  { value: 'Asia/Beirut', label: 'بيروت (EET)' },
  { value: 'Asia/Amman', label: 'عمّان (EET)' },
  { value: 'Europe/Istanbul', label: 'إسطنبول (TRT)' },
  { value: 'UTC', label: 'UTC' },
]

function emptySlot(): ScheduleSlot {
  return { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }
}

export default function SchedulePanel({ pageId, initialSettings }: SchedulePanelProps) {
  const [enabled, setEnabled] = useState(initialSettings?.schedule_enabled ?? false)
  const [timezone, setTimezone] = useState(initialSettings?.schedule_timezone ?? 'Africa/Cairo')
  const [slots, setSlots] = useState<ScheduleSlot[]>(initialSettings?.schedule_slots ?? [])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setEnabled(initialSettings?.schedule_enabled ?? false)
    setTimezone(initialSettings?.schedule_timezone ?? 'Africa/Cairo')
    setSlots(initialSettings?.schedule_slots ?? [])
    setDirty(false)
  }, [pageId, initialSettings])

  function mark() { setDirty(true) }

  function toggleEnabled() { setEnabled(v => !v); mark() }

  function addSlot() {
    setSlots(s => [...s, emptySlot()])
    mark()
  }

  function removeSlot(i: number) {
    setSlots(s => s.filter((_, idx) => idx !== i))
    mark()
  }

  function updateSlot(i: number, patch: Partial<ScheduleSlot>) {
    setSlots(s => s.map((slot, idx) => idx === i ? { ...slot, ...patch } : slot))
    mark()
  }

  function toggleDay(slotIdx: number, day: number) {
    setSlots(s => s.map((slot, idx) => {
      if (idx !== slotIdx) return slot
      const days = slot.days.includes(day)
        ? slot.days.filter(d => d !== day)
        : [...slot.days, day].sort((a, b) => a - b)
      return { ...slot, days }
    }))
    mark()
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/pages/${pageId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_enabled: enabled, schedule_timezone: timezone, schedule_slots: slots }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'خطأ')
      toast.success('تم حفظ الجدول الزمني')
      setDirty(false)
    } catch (err: any) {
      toast.error(err.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">جدول تشغيل الـ Agent</h3>
        </div>
        <button
          onClick={toggleEnabled}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {!enabled && (
        <p className="text-xs text-gray-400 dark:text-gray-500">الـ Agent يرد على مدار اليوم. فعّل الجدول لتحديد أوقات معينة.</p>
      )}

      {enabled && (
        <div className="space-y-4">
          {/* Timezone */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">المنطقة الزمنية</label>
            <select
              value={timezone}
              onChange={e => { setTimezone(e.target.value); mark() }}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-white"
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>

          {/* Slots */}
          <div className="space-y-3">
            {slots.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                لا توجد فترات — الـ Agent لن يرد على أي رسالة. أضف فترة على الأقل.
              </p>
            )}

            {slots.map((slot, i) => (
              <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                {/* Days */}
                <div className="flex flex-wrap gap-1.5">
                  {DAY_SHORT.map((label, day) => (
                    <button
                      key={day}
                      onClick={() => toggleDay(i, day)}
                      className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                        slot.days.includes(day)
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Time range */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">من</label>
                    <input
                      type="time"
                      value={slot.start}
                      onChange={e => updateSlot(i, { start: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-2 py-1.5 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">إلى</label>
                    <input
                      type="time"
                      value={slot.end}
                      onChange={e => updateSlot(i, { end: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-2 py-1.5 text-gray-900 dark:text-white"
                    />
                  </div>
                  <button
                    onClick={() => removeSlot(i)}
                    className="mt-5 p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={addSlot}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-2 text-xs text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              إضافة فترة زمنية
            </button>
          </div>
        </div>
      )}

      {/* Save button */}
      {dirty && (
        <div className="pt-1">
          <button
            onClick={save}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-sm font-medium py-2 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ الجدول
          </button>
        </div>
      )}
    </div>
  )
}
