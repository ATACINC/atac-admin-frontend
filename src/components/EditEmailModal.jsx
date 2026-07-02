import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiUpdateCandidateEmail } from '../api/client';

// Admin "Edit email" modal. Submits PATCH /candidates/:id/email and handles
// the three contract branches inline:
//   409 EMAIL_TAKEN         -> render the conflicting record + a link to it
//   422 EMAIL_DOMAIN_INVALID-> show the human-readable reason inline
//   200 { mx_warning }      -> success; parent surfaces a non-blocking amber note
// Shares the shell (scroll-lock, Esc, focus-trap, no-close-in-flight) with
// ResetPasswordModal. Reused by the candidate detail page AND stuck-issue rows.
//
// Props:
//   open          boolean
//   candidateId   uuid (required, used in the PATCH)
//   currentEmail  string (optional; prefills the input + shown as context)
//   candidateName string (optional; display only)
//   onClose       () => void
//   onComplete    ({ outcome:'success', email, mxWarning }) => void
//                 (parent invalidates queries + toasts; mxWarning may be null)
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

function humanizeReason(reason) {
  if (!reason) return '';
  return String(reason).replace(/_/g, ' ');
}

export default function EditEmailModal({
  open,
  candidateId,
  currentEmail,
  candidateName,
  onClose,
  onComplete,
}) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null); // { id, name, email, email_verified, created_at }

  const modalRef = useRef(null);
  const inputRef = useRef(null);

  const trimmed = email.trim();
  const isValid = EMAIL_RE.test(trimmed);
  const unchanged = currentEmail && trimmed.toLowerCase() === String(currentEmail).trim().toLowerCase();
  const canSubmit = isValid && !unchanged && !submitting;

  // Reset/seed state on open; clear on close.
  useEffect(() => {
    if (open) {
      setEmail(currentEmail || '');
      setError('');
      setConflict(null);
      setSubmitting(false);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open, currentEmail]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape' && !submitting) { e.preventDefault(); onClose(); return; }
      if (e.key === 'Tab') {
        const root = modalRef.current;
        if (!root) return;
        const f = root.querySelectorAll('button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])');
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const onChange = (v) => {
    setEmail(v);
    // A new address invalidates any prior conflict/error.
    if (conflict) setConflict(null);
    if (error) setError('');
  };

  const submit = async () => {
    if (!canSubmit || !candidateId) return;
    setSubmitting(true);
    setError('');
    setConflict(null);
    try {
      const data = await apiUpdateCandidateEmail(candidateId, trimmed);
      onComplete?.({
        outcome: 'success',
        email: data?.candidate?.email || trimmed,
        mxWarning: data?.mx_warning || null,
      });
      onClose();
    } catch (err) {
      const status = err?.response?.status;
      const d = err?.response?.data || {};
      if (status === 409 && d.code === 'EMAIL_TAKEN' && d.conflict) {
        setConflict(d.conflict);
      } else if (status === 422 && d.code === 'EMAIL_DOMAIN_INVALID') {
        setError(d.error || `That email's domain can't receive mail (${humanizeReason(d.reason)}).`);
      } else {
        setError(d.error || d.message || 'Could not update the email. Please try again.');
      }
      setSubmitting(false);
    }
  };

  const displayName = candidateName || currentEmail || 'this candidate';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-email-modal-title"
      onClick={() => !submitting && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(8, 11, 18, 0.85)',
        backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-3)', border: '1px solid var(--gold)', borderRadius: 6,
          padding: 32, width: '100%', maxWidth: 500,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)', color: 'var(--white)',
        }}
      >
        <h2
          id="edit-email-modal-title"
          style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--gold)', margin: '0 0 14px', lineHeight: 1.1 }}
        >
          Edit Email
        </h2>

        <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
          Update the email for <strong>{displayName}</strong>. This sets the account to{' '}
          <strong>Unverified</strong> and sends a fresh verification to the new address.
        </p>

        <label
          htmlFor="edit-email-input"
          style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--white)', marginBottom: 8 }}
        >
          New email
        </label>
        <input
          id="edit-email-input"
          ref={inputRef}
          type="email"
          value={email}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }}
          disabled={submitting}
          placeholder="name@example.com"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: '100%', boxSizing: 'border-box', background: 'rgba(8, 11, 18, 0.6)',
            border: `1px solid ${error ? 'rgba(196,92,92,0.5)' : 'var(--border-2)'}`, borderRadius: 3,
            color: 'var(--white)', fontFamily: 'Consolas, Menlo, monospace', fontSize: 14,
            padding: '11px 12px', outline: 'none', marginBottom: 4,
          }}
        />
        {unchanged && (
          <div style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>
            That's already the current email.
          </div>
        )}

        {conflict && (
          <div
            role="alert"
            style={{
              margin: '14px 0 0', padding: '12px 14px',
              background: 'rgba(196, 92, 92, 0.08)', border: '1px solid rgba(196, 92, 92, 0.32)',
              borderRadius: 4, fontSize: 13, lineHeight: 1.6,
            }}
          >
            <div style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 6 }}>
              Email already in use
            </div>
            <div style={{ color: 'var(--muted)', marginBottom: 8 }}>
              Another candidate already owns <code style={{ color: 'var(--gold)', fontFamily: 'Consolas, Menlo, monospace' }}>{conflict.email}</code>:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--white)' }}>{conflict.name || '—'}</span>
              <span style={{ color: conflict.email_verified ? 'var(--teal-2)' : 'var(--muted)', fontSize: 12 }}>
                {conflict.email_verified ? 'Verified' : 'Unverified'}
              </span>
              <Link
                to={`/candidates/${conflict.id}`}
                onClick={onClose}
                style={{ marginLeft: 'auto', color: 'var(--gold)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em' }}
              >
                Open candidate ↗
              </Link>
            </div>
          </div>
        )}

        {error && !conflict && (
          <div
            role="alert"
            style={{
              margin: '14px 0 0', padding: '10px 12px',
              background: 'rgba(196, 92, 92, 0.08)', border: '1px solid rgba(196, 92, 92, 0.32)',
              borderRadius: 3, color: 'var(--red)', fontSize: 12, lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'transparent', color: 'var(--white)', border: '1px solid var(--muted)',
              borderRadius: 2, padding: '10px 18px', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? 'var(--gold)' : 'rgba(201, 168, 76, 0.4)', color: 'var(--bg)',
              border: 'none', borderRadius: 2, padding: '10px 22px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'Updating…' : 'Update Email'}
          </button>
        </div>
      </div>
    </div>
  );
}
