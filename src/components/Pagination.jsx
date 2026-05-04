export default function Pagination({ page, pageSize, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const btn = {
    background: 'transparent',
    color: 'var(--white)',
    border: '1px solid var(--border-2)',
    borderRadius: 2,
    padding: '7px 14px',
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  };
  const btnDisabled = {
    ...btn,
    color: 'var(--muted)',
    cursor: 'not-allowed',
    opacity: 0.5,
  };

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 18,
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
        {total === 0
          ? 'No results'
          : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()}`}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          style={canPrev ? btn : btnDisabled}
          onClick={() => canPrev && onChange(page - 1)}
          disabled={!canPrev}
        >
          ← Prev
        </button>
        <button
          type="button"
          style={canNext ? btn : btnDisabled}
          onClick={() => canNext && onChange(page + 1)}
          disabled={!canNext}
        >
          Next →
        </button>
      </div>
    </nav>
  );
}
