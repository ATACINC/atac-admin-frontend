// Truncate a long string by replacing the middle with an ellipsis.
// Useful for wallet addresses, hashes, etc.
//   truncateMiddle('0x1234567890abcdef1234567890abcdef12345678', 14)
//   → '0x12345…345678'
export function truncateMiddle(str, max = 16) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

// Format an ISO date as a long, human-readable date.
//   formatLongDate('2028-04-30T00:00:00.000Z') → 'April 30, 2028'
export function formatLongDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
