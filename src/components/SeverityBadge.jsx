// Tiny dot + label for stuck-issue severity. Same visual language as the
// dashboard stuck-snapshot dots, but bigger and with text.
const SEVERITY_CONFIG = {
  high:   { color: 'var(--red)',   label: 'High'   },
  medium: { color: 'var(--amber)', label: 'Medium' },
  low:    { color: 'var(--muted)', label: 'Low'    },
};

export default function SeverityBadge({ severity }) {
  const cfg = SEVERITY_CONFIG[severity] || {
    color: 'rgba(238, 233, 223, 0.32)',
    label: 'Unknown',
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: cfg.color,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: cfg.color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  );
}
