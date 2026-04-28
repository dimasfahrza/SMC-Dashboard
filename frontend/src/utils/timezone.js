/**
 * Timezone utility
 * Auto-detect dari browser, bisa toggle ke UTC
 */

export function detectLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export function getTimezoneOffsetString(tz) {
  if (tz === 'UTC') return 'UTC+0'
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(now)
    const offset = parts.find(p => p.type === 'timeZoneName')?.value || ''
    return offset.replace('GMT', 'UTC') || 'UTC+0'
  } catch {
    return 'UTC+0'
  }
}

export function formatTimeInTz(date, tz, withSeconds = true) {
  try {
    const d = date instanceof Date ? date : new Date(date)
    const opts = {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
    if (withSeconds) opts.second = '2-digit'
    return new Intl.DateTimeFormat('en-GB', opts).format(d)
  } catch {
    return '—'
  }
}

export function getShortTzName(tz) {
  if (tz === 'UTC') return 'UTC'
  // Common mapping
  const map = {
    'Asia/Jakarta': 'WIB',
    'Asia/Makassar': 'WITA',
    'Asia/Jayapura': 'WIT',
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Los_Angeles': 'PT',
    'Europe/London': 'UK',
    'Europe/Paris': 'CET',
    'Asia/Tokyo': 'JST',
    'Asia/Singapore': 'SGT',
    'Asia/Shanghai': 'CST',
    'Australia/Sydney': 'AEST',
  }
  if (map[tz]) return map[tz]
  // Return last segment
  const seg = tz.split('/').pop() || tz
  return seg.slice(0, 6)
}
