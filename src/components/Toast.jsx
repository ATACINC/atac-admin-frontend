import { useEffect } from 'react';

// Minimal top-right toast with auto-dismiss.
// Render conditionally: { message && <Toast message={...} onDismiss={...} /> }
export default function Toast({
  message,
  type = 'success',
  duration = 3000,
  onDismiss,
}) {
  useEffect(() => {
    if (!duration || !onDismiss) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss, message]);

  if (!message) return null;

  const palette = {
    success: { color: 'var(--bg)', bg: 'var(--gold)', border: 'var(--gold)' },
    error:   { color: '#fff', bg: 'var(--red)', border: 'var(--red)' },
    warning: { color: 'var(--bg)', bg: 'var(--amber)', border: 'var(--amber)' },
  }[type] || { color: 'var(--bg)', bg: 'var(--gold)', border: 'var(--gold)' };

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 1100,
        background: palette.bg,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        borderRadius: 3,
        padding: '12px 18px',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.06em',
        cursor: 'pointer',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
        animation: 'admin-toast-in 220ms ease both',
        maxWidth: 360,
      }}
    >
      {message}
      <style>{`
        @keyframes admin-toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
