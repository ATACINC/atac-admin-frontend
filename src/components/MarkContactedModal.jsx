import { useEffect, useRef, useState } from 'react';
import { apiMarkLeadContacted } from '../api/client';

const MAX_NOTE = 1000;
const CONFLICT_AUTOCLOSE_MS = 2000;

// Self-contained "mark lead as contacted" modal.
// Mirrors RevokeModal's structure but lighter: no minimum-length validation,
// note is optional, submit is always enabled.
//
// Props:
//   leadId         — id of lead to mark contacted
//   employerName   — for display in the body lead (shows "—" if absent)
//   contactEmail   — for display in the body lead
//   isOpen         — boolean toggle
//   onClose        — close requested (Cancel / Esc / backdrop)
//   onComplete     — { outcome: 'success' | 'conflict' } — parent invalidates
//                    queries + shows toast in response. Not called for
//                    400/500 errors (those stay inline in the modal).
export default function MarkContactedModal({
  leadId,
  employerName,
  contactEmail,
  isOpen,
  onClose,
  onComplete,
}) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const modalRef = useRef(null);
  const textareaRef = useRef(null);

  const charCount = note.length;
  const tooLong = charCount > MAX_NOTE;
  const isValid = !tooLong; // note is optional, so empty is valid

  // Reset state on open/close
  useEffect(() => {
    if (!isOpen) {
      setNote('');
      setSubmitting(false);
      setError('');
    }
  }, [isOpen]);

  // Autofocus textarea
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Esc + Tab focus trap
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

  const submit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const trimmed = note.trim();
      await apiMarkLeadContacted(leadId, trimmed.length ? trimmed : null);
      onComplete?.({ outcome: 'success' });
      onClose();
    } catch (err) {
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      if (status === 409) {
        setError('Another operator already marked this lead contacted. Refreshing…');
        setTimeout(() => {
          onComplete?.({ outcome: 'conflict' });
          onClose();
        }, CONFLICT_AUTOCLOSE_MS);
        return;
      }
      if (status === 400) {
        setError(serverMsg || 'Could not save the note. Please adjust and try again.');
      } else {
        setError(serverMsg || 'Failed to mark contacted. Please try again.');
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

  const counterColor = tooLong ? 'var(--red)' : 'var(--muted)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mark-contacted-title"
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
          id="mark-contacted-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 400,
            color: 'var(--gold)',
            margin: '0 0 12px',
            lineHeight: 1.1,
          }}
        >
          Mark Lead as Contacted
        </h2>

        <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>
          Mark <strong>{employerName || '—'}</strong>
          {contactEmail && (
            <>
              {' ('}
              <span style={{ color: 'var(--gold)', fontFamily: 'Consolas, Menlo, monospace', fontSize: 13 }}>
                {contactEmail}
              </span>
              {') '}
            </>
          )}{' '}
          as contacted?
        </p>

        <label
          htmlFor="contacted-note"
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
          Optional Note
        </label>
        <textarea
          id="contacted-note"
          ref={textareaRef}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={handleTextareaKeyDown}
          rows={3}
          placeholder="e.g., sent intro email, scheduled call for Tuesday (Cmd/Ctrl+Enter to submit)"
          disabled={submitting}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'var(--bg)',
            color: 'var(--white)',
            border: `1px solid ${tooLong ? 'var(--red)' : 'var(--border)'}`,
            borderRadius: 3,
            padding: '12px 14px',
            fontSize: 14,
            fontFamily: 'var(--font-body)',
            lineHeight: 1.5,
            resize: 'vertical',
            outline: 'none',
            opacity: submitting ? 0.6 : 1,
          }}
        />
        {(charCount > 0 || tooLong) && (
          <div
            style={{
              textAlign: 'right',
              fontSize: 11,
              color: counterColor,
              marginTop: 4,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {charCount} / {MAX_NOTE}
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              margin: '12px 0 0',
              padding: '10px 12px',
              background: 'rgba(196, 92, 92, 0.08)',
              border: '1px solid rgba(196, 92, 92, 0.32)',
              borderRadius: 3,
              color: 'var(--red)',
              fontSize: 13,
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
            {submitting ? 'Saving…' : 'Mark Contacted'}
          </button>
        </div>
      </div>
    </div>
  );
}
