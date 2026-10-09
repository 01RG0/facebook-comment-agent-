export interface ScheduleSlot {
  days: number[]   // 0=Sun, 1=Mon, ..., 6=Sat
  start: string    // "HH:MM"
  end: string      // "HH:MM"
}

/**
 * Returns true if the current moment falls within any of the schedule slots.
 * If schedule_enabled is false or slots is empty, returns true (agent always on).
 */
export function isWithinSchedule(
  scheduleEnabled: boolean,
  timezone: string,
  slots: ScheduleSlot[],
  now: Date = new Date()
): boolean {
  if (!scheduleEnabled || !slots.length) return true

  try {
    // Get local time parts in the configured timezone
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(now)

    const hourPart = parts.find(p => p.type === 'hour')?.value ?? '00'
    const minutePart = parts.find(p => p.type === 'minute')?.value ?? '00'
    const weekdayPart = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'

    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const currentDay = dayMap[weekdayPart] ?? now.getDay()
    const currentTime = `${hourPart.padStart(2, '0')}:${minutePart.padStart(2, '0')}`

    return slots.some(slot => {
      if (!slot.days.includes(currentDay)) return false
      // Handle overnight slots (e.g. 22:00 - 06:00)
      if (slot.start <= slot.end) {
        return currentTime >= slot.start && currentTime < slot.end
      } else {
        return currentTime >= slot.start || currentTime < slot.end
      }
    })
  } catch {
    // Unknown timezone or other error — don't block the agent
    return true
  }
}
