import { useEffect, useRef, useState } from 'react';
import { apiArchiveCandidate } from '../api/client';

// Admin "Archive candidate" modal. Requires a reason (min 5 chars) and submits
// POST /candidates/:id/archive. On 409 HAS_ACTIVITY the archive is blocked: we
// switch to a terminal "manual review required" state showing the activity
// summary, with no retry. Shares the shell with RevokeModal/ResetPasswordModal.
//
// Props:
//   open           boolean
//   candidateId    uuid (required)
//   candidateName  string (optional; display)
//   candidateEmail string (optional; display)
//   onClose        () => void
//   onComplete     ({ outcome:'success' }) => void  (parent invalidates + toasts)
const MIN_REASON = 5;
const MAX_REASON = 500;

const ACTIVITY_ROWS = [
  ['paid', 'Payment verified', (v) => (v ? 'Yes' : 'No')],
  ['paid_sessions', 'Paid sessions', (v) => v],
  ['assessments', 'Assessments', (v) => v],
  ['credentials', 'Credentials', (v) => v],
  ['simulator_sessions', 'Scored simulator sessions', (v) => v],
];

export default function ArchiveCandidateModal({
  open,
  candidateId,
  candidateName,
  candidateEmail,
  onClose,
  onComplete,
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [blockedActivity, setBlockedActivity] = useState(null); // 409 HAS_ACTIVITY summary

  const modalRef = useRef(null);
  const textareaRef = useRef(null);

  const trimmed = reason.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_REASON;
  const isValid = trimmed.length >= MIN_REASON && reason.length <= MAX_REASON;
  const canSubmit = isValid && !submitting && !blockedActivity;

  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
      setSubmitting(false);
      setBlockedActivity(null);
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

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

  const submit = async () => {
    if (!canSubmit || !candidateId) return;
    setSubmitting(true);
    setError('');
    try {
      await apiArchiveCandidate(candidateId, trimmed);
      onComplete?.({ outcome: 'success' });
      onClose();
    } catch (err) {
      const status = err?.response?.status;
      const d = err?.response?.data || {};
      if (status === 409 && d.code === 'HAS_ACTIVITY') {
        setBlockedActivity(d.activity || {});
      } else if (status === 400 && d.code === 'ALREADY_ARCHIVED') {
        // Someone archived it already; treat as done so the page corrects.
        onComplete?.({ outcome: 'success' });
        onClose();
        return;
      } else {
        setError(d.error || d.message || 'Could not archive. Please try again.');
      }
      setSubmitting(false);
    }
  };

  const displayName = candidateName || candidateEmail || 'this candidate';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-modal-title"
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
          background: 'var(--bg-3)',
          border: `1px solid ${blockedActivity ? 'var(--amber)' : 'var(--red)'}`,
          borderRadius: 6, padding: 32, width: '100%', maxWidth: 500,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)', color: 'var(--white)',
        }}
      >
        <h2
          id="archive-modal-title"
          style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
            color: blockedActivity ? 'var(--amber)' : 'var(--red)', margin: '0 0 14px', lineHeight: 1.1,
          }}
        >
          {blockedActivity ? 'Manual Review Required' : 'Archive Candidate'}
        </h2>

        {blockedActivity ? (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
              <strong>{displayName}</strong> has real activity, so the archive is blocked. Escalate
              for manual review — this can't be archived from here.
            </p>
            <div
              style={{
                border: '1px solid var(--border-2)', borderRadius: 4, overflow: 'hidden',
                margin: '0 0 8px',
              }}
            >
              {ACTIVITY_ROWS.map(([k, label, fmt]) => (
                <div
                  key={k}
                  style={{
                    display: 'flex', justifyContent: 'space-between', gap: 12,
                    padding: '9px 14px', borderBottom: '1px solid var(--border-2)', fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  <span style={{ color: 'var(--white)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(blockedActivity[k] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent', color: 'var(--white)', border: '1px solid var(--muted)',
                  borderRadius: 2, padding: '10px 18px', fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>
              Archive <strong>{displayName}</strong>? This soft-deletes the record; it does not free
              the email or delete any data, and it can be reversed with Unarchive.
            </p>

            <label
              htmlFor="archive-reason"
              style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--white)', marginBottom: 8 }}
            >
              Reason
            </label>
            <textarea
              id="archive-reason"
              ref={textareaRef}
              value={reason}
              onChange={(e) => { setReason(e.target.value); if (error) setError(''); }}
              disabled={submitting}
              rows={3}
              maxLength={MAX_REASON}
              placeholder="Why is this candidate being archived? (min 5 characters)"
              style={{
                width: '100%', boxSizing: 'border-box', background: 'rgba(8, 11, 18, 0.6)',
                border: `1px solid ${tooShort ? 'rgba(196,92,92,0.5)' : 'var(--border-2)'}`, borderRadius: 3,
                color: 'var(--white)', fontFamily: 'var(--font-body)', fontSize: 14,
                padding: '11px 12px', outline: 'none', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', margin: '6px 0 0' }}>
              <span>{tooShort ? `At least ${MIN_REASON} characters.` : ''}</span>
              <span>{trimmed.length}/{MAX_REASON}</span>
            </div>

            {error && (
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
                  background: canSubmit ? 'var(--red)' : 'rgba(196, 92, 92, 0.4)', color: 'var(--white)',
                  border: 'none', borderRadius: 2, padding: '10px 22px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
