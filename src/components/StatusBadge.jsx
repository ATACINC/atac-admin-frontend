const STATUS_STYLES = {
  active: { color: 'var(--teal-2)', bg: 'rgba(34, 166, 126, 0.10)', border: 'rgba(34, 166, 126, 0.28)' },
  valid: { color: 'var(--teal-2)', bg: 'rgba(34, 166, 126, 0.10)', border: 'rgba(34, 166, 126, 0.28)' },
  issued: { color: 'var(--teal-2)', bg: 'rgba(34, 166, 126, 0.10)', border: 'rgba(34, 166, 126, 0.28)' },
  passed: { color: 'var(--teal-2)', bg: 'rgba(34, 166, 126, 0.10)', border: 'rgba(34, 166, 126, 0.28)' },
  pass: { color: 'var(--teal-2)', bg: 'rgba(34, 166, 126, 0.10)', border: 'rgba(34, 166, 126, 0.28)' },
  pending: { color: 'var(--amber)', bg: 'rgba(196, 138, 42, 0.10)', border: 'rgba(196, 138, 42, 0.28)' },
  processing: { color: 'var(--amber)', bg: 'rgba(196, 138, 42, 0.10)', border: 'rgba(196, 138, 42, 0.28)' },
  in_progress: { color: 'var(--amber)', bg: 'rgba(196, 138, 42, 0.10)', border: 'rgba(196, 138, 42, 0.28)' },
  failed: { color: 'var(--red)', bg: 'rgba(196, 92, 92, 0.10)', border: 'rgba(196, 92, 92, 0.28)' },
  fail: { color: 'var(--red)', bg: 'rgba(196, 92, 92, 0.10)', border: 'rgba(196, 92, 92, 0.28)' },
  revoked: { color: 'var(--red)', bg: 'rgba(196, 92, 92, 0.10)', border: 'rgba(196, 92, 92, 0.28)' },
  expired: { color: 'var(--muted)', bg: 'rgba(238, 233, 223, 0.04)', border: 'var(--border-2)' },
  not_applicable: { color: 'var(--muted)', bg: 'rgba(238, 233, 223, 0.04)', border: 'var(--border-2)' },
};

const DEFAULT = { color: 'var(--muted)', bg: 'var(--faint)', border: 'var(--border-2)' };

export default function StatusBadge({ status, children }) {
  const key = String(status || '').toLowerCase().trim();
  const style = STATUS_STYLES[key] || DEFAULT;
  const label = children ?? (status ? String(status).replace(/_/g, ' ') : 'unknown');

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        borderRadius: 2,
        padding: '3px 10px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
