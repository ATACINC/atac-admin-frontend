export default function LoadingSpinner({ size = 28, label }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          border: '2px solid rgba(201, 168, 76, 0.18)',
          borderTopColor: 'var(--gold)',
          borderRadius: '50%',
          animation: 'admin-spin 0.8s linear infinite',
        }}
      />
      {label && (
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          {label}
        </span>
      )}
      <style>{`@keyframes admin-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
