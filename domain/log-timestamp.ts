export function formatLogTimestamp(date: Date, offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const minutes = String(abs % 60).padStart(2, '0')
  const local = new Date(date.getTime() + offsetMinutes * 60_000)
    .toISOString()
    .replace('Z', `${sign}${hours}:${minutes}`)
  return `${local} | ${date.toISOString()}`
}
