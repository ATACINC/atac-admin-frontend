export default function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div
      role="alert"
      style={{
        background: 'rgba(196, 92, 92, 0.07)',
        border: '1px solid rgba(196, 92, 92, 0.25)',
        borderRadius: 4,
        padding: '20px 22px',
        color: 'var(--white)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          color: 'var(--red)',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {message && (
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
          {message}
        </div>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 14,
            background: 'transparent',
            color: 'var(--gold)',
            border: '1px solid var(--border)',
            borderRadius: 2,
            padding: '8px 16px',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}
