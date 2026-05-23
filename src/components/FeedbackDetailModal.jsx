import { useEffect, useRef } from 'react';
import { formatLongDate } from '../utils/format';

// Read-only detail modal for a single feedback row.
//
// Props:
//   row      the full feedback object from /feedback/list, or null when closed
//   onClose  called on Cancel / Esc / backdrop click
//
// Behaviour mirrors RevokeModal / ResetPasswordModal: body scroll lock,
// Esc to close, backdrop click to close, focus the close button on mount.

export default function FeedbackDetailModal({ row, onClose }) {
  const closeButtonRef = useRef(null);

  // Esc to close
  useEffect(() => {
    if (!row) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [row, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!row) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [row]);

  // Focus close button on mount
  useEffect(() => {
    if (row) {
      const t = setTimeout(() => closeButtonRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [row]);

  if (!row) return null;

  const recommendYes = row.would_recommend === true;
  const scoreDisplay = row.score != null ? `${row.score}%` : 'Not scored';
  const submittedDisplay = row.submitted_at ? formatLongDate(row.submitted_at) : 'Unknown';
  const sourceDisplay = (row.source || 'unknown').toLowerCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-detail-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-3)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: 28,
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
          color: 'var(--white)',
        }}
      >
        {/* Header: candidate name + email */}
        <h2
          id="feedback-detail-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 400,
            color: 'var(--white)',
            margin: '0 0 4px',
            lineHeight: 1.1,
          }}
        >
          {row.candidate_name || 'Anonymous candidate'}
        </h2>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--muted)',
            marginBottom: 16,
          }}
        >
          {row.candidate_email || 'No email on record'}
        </div>

        {/* Metadata strip */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 18,
            fontSize: 12,
            color: 'var(--muted)',
            letterSpacing: '0.06em',
            paddingBottom: 18,
            borderBottom: '1px solid var(--border-2)',
            marginBottom: 22,
          }}
        >
          <span>Submitted: <span style={{ color: 'var(--white)' }}>{submittedDisplay}</span></span>
          <span>Score: <span style={{ color: 'var(--white)' }}>{scoreDisplay}</span></span>
          <span>Source: <span style={{ color: 'var(--white)' }}>{sourceDisplay}</span></span>
        </div>

        {/* Ratings 2x2 grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 14,
            marginBottom: 22,
          }}
        >
          <RatingTile label="Difficulty" value={row.difficulty_rating} />
          <RatingTile label="Clarity" value={row.clarity_rating} />
          <RatingTile label="Time pressure" value={row.time_pressure_rating} />
          <RatingTile label="Fairness" value={row.fairness_rating} />
        </div>

        {/* Recommend */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            background: recommendYes ? 'rgba(34, 166, 126, 0.06)' : 'rgba(196, 92, 92, 0.06)',
            border: `1px solid ${recommendYes ? 'var(--teal-2)' : 'var(--red)'}`,
            borderRadius: 4,
            marginBottom: 24,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Would recommend:
          </span>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: recommendYes ? 'var(--teal-2)' : 'var(--red)',
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            {recommendYes ? 'Yes' : 'No'}
          </span>
        </div>

        {/* UI Friction Notes */}
        <TextSection
          label="UI Friction Notes"
          body={row.ui_friction_notes}
          emptyText="No UI friction notes provided."
        />

        {/* Free text */}
        <TextSection
          label="Additional Feedback"
          body={row.free_text}
          emptyText="No additional feedback provided."
        />

        {/* Close button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: 24,
          }}
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--gold)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 2,
              padding: '11px 24px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingTile({ label, value }) {
  const has = typeof value === 'number';
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--border-2)',
        borderRadius: 4,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: 'var(--muted)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 8,
          fontFamily: 'var(--font-body)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          color: 'var(--white)',
          fontWeight: 400,
          lineHeight: 1,
        }}
      >
        {has ? (
          <>
            {value}
            <span style={{ fontSize: 14, color: 'var(--muted)' }}> / 5</span>
          </>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 14 }}>Not rated</span>
        )}
      </div>
    </div>
  );
}

function TextSection({ label, body, emptyText }) {
  const hasBody = typeof body === 'string' && body.trim().length > 0;
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 10,
          color: 'var(--muted)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 8,
          fontFamily: 'var(--font-body)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--border-2)',
          borderRadius: 3,
          padding: '14px 16px',
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: hasBody ? 'var(--white)' : 'var(--muted)',
          fontStyle: hasBody ? 'normal' : 'italic',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
        }}
      >
        {hasBody ? body : emptyText}
      </div>
    </div>
  );
}
