export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount)

export const formatDate = (date: string | Date): string =>
  new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(date))

export const formatRelativeTime = (date: string | Date): string => {
  const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' })
  const diffMs = new Date(date).getTime() - Date.now()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60))
    if (Math.abs(diffHours) < 1) {
      const diffMinutes = Math.round(diffMs / (1000 * 60))
      return rtf.format(diffMinutes, 'minute')
    }
    return rtf.format(diffHours, 'hour')
  }
  return rtf.format(diffDays, 'day')
}
