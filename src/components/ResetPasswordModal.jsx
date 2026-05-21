import { useEffect, useRef, useState } from 'react';
import { apiResetCandidatePassword } from '../api/client';

// Confirmation modal for admin-initiated candidate password reset.
//
// Props:
//   open            boolean toggle
//   candidateEmail  string (required, used in confirmation prose and API call)
//   candidateName   string (optional, displayed if present)
//   onClose         called on Cancel, Esc, backdrop click, or after success
//   onComplete      called as ({ outcome: 'success' }) after a successful
//                   reset. Cancellation is signalled via onClose only.
//                   Parent can use this to show a toast on success.
//
// Behaviour mirrors RevokeModal.jsx: body scroll lock, Esc to close,
// Tab focus trap, no close while in flight.
export default function ResetPasswordModal({
  open,
  candidateEmail,
  candidateName,
  onClose,
  onComplete,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const modalRef = useRef(null);
  const primaryButtonRef = useRef(null);

  // ── Reset state when opened/closed ─────────────────────────────
  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setError('');
    }
  }, [open]);

  // ── Autofocus primary button on open ───────────────────────────
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => primaryButtonRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ── Lock body scroll while modal is open ───────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ── Esc to close + Tab focus trap ──────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' && !submitting) {
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
  }, [open, submitting, onClose]);

  if (!open) return null;

  // ── Submit handler ─────────────────────────────────────────────
  const submit = async () => {
    if (submitting || !candidateEmail) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await apiResetCandidatePassword(candidateEmail);
      // Defensive: if backend returns 200 but emailSent is false, treat
      // as failure so the operator knows the password has not changed.
      if (data && data.emailSent === false) {
        setError(
          'Email delivery failed. The password has NOT been changed. Try again or check Postmark.',
        );
        setSubmitting(false);
        return;
      }
      onComplete?.({ outcome: 'success' });
      onClose();
    } catch (err) {
      const status = err?.response?.status;
      const emailSent = err?.response?.data?.emailSent;
      if (status === 404) {
        setError(`No candidate found with email ${candidateEmail}.`);
      } else if (status === 500 && emailSent === false) {
        setError(
          'Email delivery failed. The password has NOT been changed. Try again or check Postmark.',
        );
      } else {
        const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
        setError(serverMsg || 'Reset failed. Try again or contact support.');
      }
      setSubmitting(false);
    }
  };

  const displayName = candidateName || 'this candidate';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-password-modal-title"
      onClick={() => !submitting && onClose()}
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
          border: '1px solid var(--gold)',
          borderRadius: 6,
          padding: 32,
          width: '100%',
          maxWidth: 500,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
          color: 'var(--white)',
        }}
      >
        <h2
          id="reset-password-modal-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 400,
            color: 'var(--gold)',
            margin: '0 0 14px',
            lineHeight: 1.1,
          }}
        >
          Reset Password
        </h2>

        <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 12px' }}>
          Send a temporary password to <strong>{displayName}</strong>?
        </p>

        <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 18px', color: 'var(--muted)' }}>
          An email will be sent to{' '}
          <code style={{ color: 'var(--gold)', fontFamily: 'Consolas, Menlo, monospace' }}>
            {candidateEmail}
          </code>{' '}
          with a randomly generated temporary password. The candidate will be prompted to change it after signing in.
        </p>

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

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 12,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
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
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            ref={primaryButtonRef}
            type="button"
            onClick={submit}
            disabled={submitting || !candidateEmail}
            style={{
              background: submitting || !candidateEmail ? 'rgba(201, 168, 76, 0.4)' : 'var(--gold)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 2,
              padding: '10px 22px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: submitting || !candidateEmail ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Sending…' : 'Send Reset Email'}
          </button>
        </div>
      </div>
    </div>
  );
}
