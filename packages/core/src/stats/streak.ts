const DAY_MS = 24 * 60 * 60 * 1000

// Dates are parsed as UTC midnights, so DST never shifts a day.
function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS)
}

export function streak(activeDays: readonly string[], today: string): { current: number; best: number } {
  const days = [...new Set(activeDays.map(dayNumber))].sort((a, b) => a - b)
  const todayNumber = dayNumber(today)

  let best = 0
  let run = 0
  let current = 0
  let previous: number | undefined

  for (const day of days) {
    run = previous !== undefined && day === previous + 1 ? run + 1 : 1
    best = Math.max(best, run)
    const endsAtToday = day === todayNumber || day === todayNumber - 1
    if (endsAtToday) current = run
    previous = day
  }

  return { current, best }
}
