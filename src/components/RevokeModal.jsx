import { useEffect, useRef, useState } from 'react';
import { apiRevokeCredential } from '../api/client';

const MIN_REASON = 10;
const MAX_REASON = 500;
const CONFLICT_AUTOCLOSE_MS = 2000;

// Self-contained revoke confirmation modal.
//
// Props:
//   credentialId   — id of credential to revoke
//   candidateName  — for display in the body lead
//   isOpen         — boolean toggle
//   onClose        — close requested (Cancel / Esc / backdrop)
//   onComplete     — { outcome: 'success' | 'conflict' } — parent invalidates
//                    queries + shows toast in response. Not called for
//                    400/500 errors (those stay inline in the modal).
export default function RevokeModal({
  credentialId,
  candidateName,
  isOpen,
  onClose,
  onComplete,
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const modalRef = useRef(null);
  const textareaRef = useRef(null);

  const trimmed = reason.trim();
  const charCount = reason.length;
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_REASON;
  const tooLong = charCount > MAX_REASON;
  const isValid = trimmed.length >= MIN_REASON && charCount <= MAX_REASON;

  // ── Reset state when opened/closed ─────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setReason('');
      setSubmitting(false);
      setError('');
    }
  }, [isOpen]);

  // ── Autofocus textarea on open ─────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      // Defer to next tick so the element is mounted
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Lock body scroll while modal is open ───────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // ── Esc to close + Tab focus trap ──────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  // ── Submit handler ─────────────────────────────────────────────
  const submit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await apiRevokeCredential(credentialId, trimmed);
      onComplete?.({ outcome: 'success' });
      onClose();
    } catch (err) {
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      if (status === 409) {
        setError(
          'Another operator revoked this credential just now. The page will refresh.',
        );
        // Auto-close after the user sees the message; parent refetches.
        setTimeout(() => {
          onComplete?.({ outcome: 'conflict' });
          onClose();
        }, CONFLICT_AUTOCLOSE_MS);
        // Keep submit disabled so they can't double-fire
        return;
      }
      if (status === 400) {
        setError(serverMsg || 'Invalid reason. Please try again.');
      } else {
        setError(serverMsg || 'Revoke failed. Please try again.');
      }
      setSubmitting(false);
    }
  };

  const handleTextareaKeyDown = (e) => {
    // Cmd/Ctrl+Enter submits without inserting a newline
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  // ── Char counter color ─────────────────────────────────────────
  const counterColor = tooLong
    ? 'var(--red)'
    : tooShort
    ? 'var(--amber)'
    : 'var(--muted)';

  // ── Validation message ─────────────────────────────────────────
  let validationMsg = '';
  if (tooLong) validationMsg = 'Maximum 500 characters';
  else if (tooShort) validationMsg = 'Reason must be at least 10 characters';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-modal-title"
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
          border: '1px solid var(--red)',
          borderRadius: 6,
          padding: 32,
          width: '100%',
          maxWidth: 500,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
          color: 'var(--white)',
        }}
      >
        <h2
          id="revoke-modal-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 400,
            color: 'var(--red)',
            margin: '0 0 12px',
            lineHeight: 1.1,
          }}
        >
          Revoke Credential
        </h2>

        <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
          You are about to revoke credential{' '}
          <code style={{ color: 'var(--gold)', fontFamily: 'Consolas, Menlo, monospace' }}>
            {credentialId}
          </code>{' '}
          for <strong>{candidateName || 'this candidate'}</strong>.
        </p>

        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: 8,
            }}
          >
            This will:
          </div>
          <ul
            style={{
              margin: 0,
              padding: '0 0 0 20px',
              fontSize: 12,
              color: 'var(--muted)',
              lineHeight: 1.6,
            }}
          >
            <li>Mark the credential as revoked in the database</li>
            <li>Update the public verification page immediately</li>
            <li>Be permanently logged in the audit trail</li>
          </ul>
        </div>

        <label
          htmlFor="revoke-reason"
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--white)',
            marginBottom: 8,
          }}
        >
          Reason <span style={{ color: 'var(--red)' }}>(required)</span>
        </label>
        <textarea
          id="revoke-reason"
          ref={textareaRef}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={handleTextareaKeyDown}
          rows={4}
          placeholder="e.g., violation of certification terms, candidate request, system error during issuance (Cmd/Ctrl+Enter to submit)"
          disabled={submitting}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'var(--bg)',
            color: 'var(--white)',
            border: `1px solid ${tooLong ? 'var(--red)' : 'var(--border)'}`,
            borderRadius: 3,
            padding: '12px 14px',
            fontSize: 13,
            fontFamily: 'Consolas, Menlo, monospace',
            lineHeight: 1.5,
            resize: 'vertical',
            outline: 'none',
            opacity: submitting ? 0.6 : 1,
          }}
        />
        <div
          style={{
            textAlign: 'right',
            fontSize: 11,
            color: counterColor,
            marginTop: 4,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {charCount} / {MAX_REASON}
        </div>

        {(validationMsg || error) && (
          <div
            role="alert"
            style={{
              margin: '12px 0 0',
              padding: '10px 12px',
              background: 'rgba(196, 92, 92, 0.08)',
              border: '1px solid rgba(196, 92, 92, 0.32)',
              borderRadius: 3,
              color: 'var(--red)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {error || validationMsg}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 24,
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
            type="button"
            onClick={submit}
            disabled={!isValid || submitting}
            style={{
              background: !isValid || submitting ? 'rgba(201, 168, 76, 0.4)' : 'var(--gold)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 2,
              padding: '10px 22px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: !isValid || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </div>
    </div>
  );
}
