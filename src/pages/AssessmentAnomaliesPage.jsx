import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiGetAssessmentAnomalies,
  apiGetAssessmentTimings,
  apiReviewAssessment,
} from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { timeAgo } from '../utils/timeAgo';
import './AssessmentAnomaliesPage.css';

// Sort options the page exposes (must match backend ANOMALIES_SORT_KEYS).
const SORT_OPTIONS = [
  { value: 'created_at',      label: 'Newest first' },
  { value: 'suspicion_score', label: 'Highest score first' },
];

// Human labels for flags. Anything starting with 'REVIEWED:' is a per-row
// reviewer marker (rendered as a separate "Reviewed" chip with the email).
const FLAG_LABELS = {
  FAST_AVG:               'Fast avg',
  LOW_VARIANCE:           'Low variance',
  PAUSE_DETECTED:         'Pause detected',
  TAB_BLUR_HIGH:          'Tab blurs',
  FULLSCREEN_EXITS_HIGH:  'Fullscreen exits',
};

// Detect a "REVIEWED:<email>" marker in the integrity_flags array.
function getReviewedBy(flags) {
  if (!Array.isArray(flags)) return null;
  const m = flags.find((f) => typeof f === 'string' && f.startsWith('REVIEWED:'));
  return m ? m.slice('REVIEWED:'.length) : null;
}

// Strip out REVIEWED:* entries for the "real" flags chip row.
function realFlags(flags) {
  if (!Array.isArray(flags)) return [];
  return flags.filter((f) => typeof f === 'string' && !f.startsWith('REVIEWED:'));
}

// Round to nearest int; null-safe.
function ri(n) {
  return n == null ? null : Math.round(Number(n));
}

export default function AssessmentAnomaliesPage() {
  const [sortBy, setSortBy] = useState('created_at');
  const [hideReviewed, setHideReviewed] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [reviewModal, setReviewModal] = useState(null); // { id, candidateName }

  const qc = useQueryClient();

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['assessment-anomalies', sortBy],
    queryFn: () => apiGetAssessmentAnomalies({ sortBy, limit: 100 }),
    placeholderData: (prev) => prev,
  });

  const allRows = data?.data || [];
  const totalRaw = data?.total ?? 0;

  const visible = useMemo(() => {
    if (!hideReviewed) return allRows;
    return allRows.filter((r) => getReviewedBy(r.integrityFlags) == null);
  }, [allRows, hideReviewed]);

  // ── Loading ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div>
        <Header isLoading subtitle="" />
        <div className="anomalies-state anomalies-state-empty">
          <LoadingSpinner label="Loading anomalies" />
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div>
        <Header subtitle="Could not load" />
        <ErrorState
          title="Could not load anomalies"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div>
      <Header
        subtitle={
          `${totalRaw.toLocaleString()} flagged submission${totalRaw === 1 ? '' : 's'}` +
          (isFetching ? '  ·  refreshing...' : '')
        }
        sortBy={sortBy}
        onChangeSort={setSortBy}
        hideReviewed={hideReviewed}
        onToggleHideReviewed={() => setHideReviewed((v) => !v)}
      />

      {totalRaw === 0 ? (
        <div className="anomalies-state anomalies-state-healthy">
          <span className="anomalies-state-icon" aria-hidden="true">✓</span>
          No anomalies to review
        </div>
      ) : visible.length === 0 ? (
        <div className="anomalies-state anomalies-state-empty">
          All flagged submissions have been reviewed.
        </div>
      ) : (
        <div className="anomalies-list">
          {visible.map((row) => (
            <AnomalyCard
              key={row.id}
              row={row}
              isExpanded={expandedId === row.id}
              onToggleExpand={() =>
                setExpandedId((v) => (v === row.id ? null : row.id))
              }
              onMarkReviewed={() =>
                setReviewModal({
                  id: row.id,
                  candidateName: row.candidateName,
                  candidateEmail: row.candidateEmail,
                })
              }
            />
          ))}
        </div>
      )}

      {reviewModal && (
        <ReviewModal
          assessmentId={reviewModal.id}
          candidateName={reviewModal.candidateName}
          candidateEmail={reviewModal.candidateEmail}
          onClose={() => setReviewModal(null)}
          onSuccess={() => {
            setReviewModal(null);
            qc.invalidateQueries({ queryKey: ['assessment-anomalies'] });
          }}
        />
      )}
    </div>
  );
}

/* ─── Header ─────────────────────────────────────────────────────────── */
function Header({
  subtitle, sortBy, onChangeSort, hideReviewed, onToggleHideReviewed, isLoading,
}) {
  return (
    <header className="anomalies-header">
      <div>
        <h1 className="anomalies-title">Assessment Anomalies</h1>
        <div className="anomalies-subtitle">
          {isLoading ? 'Loading...' : subtitle}
        </div>
      </div>
      {onChangeSort && (
        <div className="anomalies-controls">
          <label className="anomalies-toggle">
            <input
              type="checkbox"
              checked={hideReviewed}
              onChange={onToggleHideReviewed}
              aria-label="Hide already-reviewed anomalies"
            />
            Hide reviewed
          </label>
          <select
            value={sortBy}
            onChange={(e) => onChangeSort(e.target.value)}
            className="anomalies-sort"
            aria-label="Sort anomalies"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}
    </header>
  );
}

/* ─── Anomaly card ───────────────────────────────────────────────────── */
function AnomalyCard({ row, isExpanded, onToggleExpand, onMarkReviewed }) {
  const reviewedBy = getReviewedBy(row.integrityFlags);
  const flags = realFlags(row.integrityFlags);
  const isHigh = row.suspicionScore >= 50 || flags.includes('FAST_AVG') || flags.includes('LOW_VARIANCE');

  return (
    <article className={`anomalies-card ${isHigh ? 'anomalies-card-high' : 'anomalies-card-medium'}`}>
      <div className="anomalies-card-header">
        <div className="anomalies-card-identity">
          <div className="anomalies-card-name">{row.candidateName || 'Unknown candidate'}</div>
          <div className="anomalies-card-email">{row.candidateEmail || ''}</div>
        </div>
        <div className="anomalies-card-meta">
          <span className="anomalies-score" title="Suspicion score">{row.suspicionScore}</span>
          <span className="anomalies-age" title={row.createdAt}>{timeAgo(row.createdAt)}</span>
        </div>
      </div>

      <div className="anomalies-card-body">
        <div className="anomalies-flags">
          {flags.length === 0 ? (
            <span className="anomalies-flag-none">No flags (score-only)</span>
          ) : (
            flags.map((f) => (
              <span key={f} className="anomalies-flag-chip" title={f}>
                {FLAG_LABELS[f] || f}
              </span>
            ))
          )}
          {reviewedBy && (
            <span className="anomalies-flag-reviewed" title={`Reviewed by ${reviewedBy}`}>
              Reviewed: {reviewedBy}
            </span>
          )}
        </div>

        <div className="anomalies-stats">
          <Stat label="Score" value={row.percentage != null ? `${ri(row.percentage)}%` : 'n/a'} />
          <Stat label="Total time" value={fmtSeconds(row.totalTimeSeconds)} />
          <Stat label="Avg / Q" value={fmtSeconds(row.avgTimePerQuestion)} />
          <Stat label="Min / Q" value={fmtSeconds(row.minTimePerQuestion)} />
          <Stat label="Max / Q" value={fmtSeconds(row.maxTimePerQuestion)} />
          <Stat label="Tab blurs" value={row.tabBlurCount} />
          <Stat label="FS exits" value={row.fullscreenExitCount} />
          <Stat label="IP changed" value={row.ipChangedDuring ? 'Yes' : 'No'} />
        </div>
      </div>

      <div className="anomalies-card-actions">
        <button
          type="button"
          className="anomalies-action-btn"
          onClick={onToggleExpand}
          aria-expanded={isExpanded}
        >
          {isExpanded ? 'Hide question timings' : 'View question timings'}
        </button>
        {!reviewedBy && (
          <button
            type="button"
            className="anomalies-action-btn anomalies-action-btn-primary"
            onClick={onMarkReviewed}
          >
            Mark Reviewed
          </button>
        )}
      </div>

      {isExpanded && <ExpandedTimings assessmentId={row.id} />}
    </article>
  );
}

/* ─── Stat box ───────────────────────────────────────────────────────── */
function Stat({ label, value }) {
  return (
    <div className="anomalies-stat">
      <div className="anomalies-stat-label">{label}</div>
      <div className="anomalies-stat-value">{value == null ? 'n/a' : value}</div>
    </div>
  );
}

/* ─── Expanded timings ───────────────────────────────────────────────── */
function ExpandedTimings({ assessmentId }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['assessment-timings', assessmentId],
    queryFn: () => apiGetAssessmentTimings(assessmentId),
    enabled: !!assessmentId,
  });

  if (isLoading) {
    return (
      <div className="anomalies-timings">
        <LoadingSpinner label="Loading timings" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="anomalies-timings anomalies-timings-error">
        Failed to load timings: {error?.response?.data?.error || error?.message || 'unknown'}
      </div>
    );
  }

  const timings = data?.timings || [];
  if (timings.length === 0) {
    return (
      <div className="anomalies-timings anomalies-timings-empty">
        No per-question timings recorded for this assessment.
        <div className="anomalies-timings-hint">
          (Likely a legacy submission from before the telemetry deploy.)
        </div>
      </div>
    );
  }

  const max = Math.max(...timings.map((t) => t.durationSeconds || 0)) || 1;

  return (
    <div className="anomalies-timings">
      <div className="anomalies-timings-header">
        Question timings ({timings.length} questions, max {max}s)
      </div>
      <div className="anomalies-timings-bars">
        {timings.map((t, i) => {
          const sec = t.durationSeconds || 0;
          const pct = Math.round((sec / max) * 100);
          return (
            <div key={t.eventId || i} className="anomalies-timings-row">
              <div className="anomalies-timings-label">
                Q{t.questionId != null ? t.questionId : (i + 1)}
              </div>
              <div className="anomalies-timings-bar-track">
                <div
                  className="anomalies-timings-bar-fill"
                  style={{ width: `${pct}%` }}
                  aria-label={`${sec} seconds`}
                />
              </div>
              <div className="anomalies-timings-value">{sec}s</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Mark Reviewed modal ────────────────────────────────────────────── */
function ReviewModal({ assessmentId, candidateName, candidateEmail, onClose, onSuccess }) {
  const [confirmText, setConfirmText] = useState('');
  const [note, setNote] = useState('');
  const [submitError, setSubmitError] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiReviewAssessment(assessmentId, note.trim() || null),
    onSuccess: () => onSuccess(),
    onError: (err) => {
      setSubmitError(
        err?.response?.data?.error || err?.message || 'Failed to record review',
      );
    },
  });

  const canSubmit = confirmText === 'REVIEW' && !mutation.isPending;

  const handleConfirm = () => {
    if (!canSubmit) return;
    setSubmitError('');
    mutation.mutate();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && canSubmit) handleConfirm();
  };

  return (
    <div
      className="anomalies-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anomalies-review-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={onKeyDown}
    >
      <div className="anomalies-modal">
        <h2 id="anomalies-review-title" className="anomalies-modal-title">
          Mark this assessment as reviewed?
        </h2>
        <div className="anomalies-modal-target">
          <div>{candidateName || 'Unknown candidate'}</div>
          <div className="anomalies-modal-email">{candidateEmail}</div>
        </div>
        <p className="anomalies-modal-body">
          Type REVIEW to confirm. The reviewer email will be added to the integrity flags.
        </p>

        <input
          type="text"
          className="anomalies-modal-input"
          placeholder="Type REVIEW"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          aria-label="Confirmation text"
          autoFocus
        />

        <label className="anomalies-modal-note-label" htmlFor="anomalies-review-note">
          Review note (optional, max 500 characters)
        </label>
        <textarea
          id="anomalies-review-note"
          className="anomalies-modal-note"
          placeholder="Optional review note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={3}
        />

        {submitError && (
          <div className="anomalies-modal-error" role="alert">
            {submitError}
          </div>
        )}

        <div className="anomalies-modal-actions">
          <button
            type="button"
            className="anomalies-modal-cancel"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="anomalies-modal-confirm"
            onClick={handleConfirm}
            disabled={!canSubmit}
          >
            {mutation.isPending ? 'Recording...' : 'Confirm Review'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
function fmtSeconds(s) {
  if (s == null) return 'n/a';
  const n = Number(s);
  if (!Number.isFinite(n)) return 'n/a';
  if (n < 60) return `${ri(n)}s`;
  const m = Math.floor(n / 60);
  const r = ri(n - m * 60);
  return `${m}m ${r}s`;
}
