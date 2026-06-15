export function formatLocalTime(t: number | string | null | undefined): string {
  if (t == null || t === '') return ''
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return String(t)
  const base = d.toLocaleString('sv-SE')
  const tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(d)
    .find(p => p.type === 'timeZoneName')?.value
  return tz ? `${base} ${tz}` : base
}
