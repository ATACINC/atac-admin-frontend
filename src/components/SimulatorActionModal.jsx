import { useEffect, useRef } from 'react';

// Generic confirmation modal for the simulator ops actions (Clear Cooldown,
// Force Retry, Reset Attempt). Mirrors ResetPasswordModal/RevokeModal:
// body scroll lock, Esc to close, Tab focus trap, autofocus primary, no
// close while in flight, backdrop click closes when idle.
//
// This modal does NOT call the API itself. The parent owns the react-query
// mutation and passes onConfirm (fires the mutation), confirming, and error.
// Children render the action-specific confirmation detail (for Reset
// Attempt: the target session status + age so a live call is never killed
// by accident).
//
// Props:
//   open         boolean
//   title        string
//   confirmLabel string (primary button copy; "...ing" handled by confirming)
//   confirmingLabel string (optional, shown while confirming)
//   tone         'gold' | 'amber' (primary button accent; default 'gold')
//   confirming   boolean (in-flight)
//   error        string ('' when none)
//   onConfirm    () => void   (parent fires the mutation)
//   onClose      () => void
//   children     confirmation body
export default function SimulatorActionModal({
  open,
  title,
  confirmLabel,
  confirmingLabel,
  tone = 'gold',
  confirming = false,
  error = '',
  onConfirm,
  onClose,
  children,
}) {
  const modalRef = useRef(null);
  const primaryButtonRef = useRef(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => primaryButtonRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' && !confirming) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const root = modalRef.current;
        if (!root) return;
        const focusable = root.querySelectorAll(
          'button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, confirming, onClose]);

  if (!open) return null;

  const accent = tone === 'amber' ? 'var(--amber)' : 'var(--gold)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sim-action-modal-title"
      onClick={() => !confirming && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8, 11, 18, 0.85)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-3)',
          border: `1px solid ${accent}`,
          borderRadius: 6,
          padding: 32,
          width: '100%',
          maxWidth: 520,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
          color: 'var(--white)',
        }}
      >
        <h2
          id="sim-action-modal-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 400,
            color: accent,
            margin: '0 0 14px',
            lineHeight: 1.1,
          }}
        >
          {title}
        </h2>

        <div style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>
          {children}
        </div>

        {error && (
          <div
            role="alert"
            style={{
              margin: '0 0 18px',
              padding: '10px 12px',
              background: 'rgba(196, 92, 92, 0.08)',
              border: '1px solid rgba(196, 92, 92, 0.32)',
              borderRadius: 3,
              color: 'var(--red)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            style={{
              background: 'transparent',
              color: 'var(--white)',
              border: '1px solid var(--muted)',
              borderRadius: 2,
              padding: '10px 18px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: confirming ? 'not-allowed' : 'pointer',
              opacity: confirming ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            ref={primaryButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            style={{
              background: confirming ? 'rgba(201, 168, 76, 0.4)' : accent,
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 2,
              padding: '10px 22px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: confirming ? 'not-allowed' : 'pointer',
            }}
          >
            {confirming ? (confirmingLabel || 'Working...') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
