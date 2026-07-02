import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGetStuckIssues, apiResendVerification } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import SeverityBadge from '../components/SeverityBadge';
import Toast from '../components/Toast';
import EditEmailModal from '../components/EditEmailModal';
import { timeAgo } from '../utils/timeAgo';
import { humanizeStuckType, humanizeNoteKey } from '../utils/humanize';
import './StuckIssuesPage.css';

// All issue types in canonical order. Render even when count = 0 so ops
// can see the categories the system tracks.
const ISSUE_TYPES = [
  'failedMint',
  'stuckAssessment',
  'emailBounce',
  'undeliveredCredential',
  'simulatorFailure',
];

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

// Short pill labels (per brief). humanizeStuckType returns the longer form
// used in card headers; pills want a tighter label.
const PILL_LABELS = {
  failedMint:            'Failed Mints',
  stuckAssessment:       'Stuck Assessments',
  emailBounce:           'Email Bounces',
  undeliveredCredential: 'Undelivered',
  simulatorFailure:      'Simulator Failures',
};

// failureStage (snake_case) -> readable label for the stage badge.
function humanizeStage(stage) {
  if (!stage) return '';
  return String(stage)
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ── Shape-tolerant accessors ────────────────────────────────────────────
// The backend currently emits flat fields (targetType, targetId, message,
// createdAt). The brief described nested fields (target.{type,id,label},
// description, age). Read both so we don't break if the backend evolves.
const getMessage = (i) => i.message ?? i.description ?? '';
const getAge = (i) => i.age ?? i.createdAt;
const getTargetType = (i) => i.target?.type ?? i.targetType;
const getTargetId = (i) => i.target?.id ?? i.targetId;
const getTargetLabel = (i) => i.target?.label ?? '';

// Backend embeds candidate email inside the message string as `<email>`.
// Extract for "View Candidate" action; null if not parseable.
const EMAIL_IN_BRACKETS = /<([^@\s>]+@[^@\s>]+)>/;
function extractEmailFromMessage(msg) {
  if (!msg) return null;
  const m = String(msg).match(EMAIL_IN_BRACKETS);
  return m ? m[1] : null;
}

export default function StuckIssuesPage() {
  const [hideTest, setHideTest] = useState(true);
  const [activeType, setActiveType] = useState('all'); // 'all' | one of ISSUE_TYPES

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['stuck-issues'],
    queryFn: apiGetStuckIssues,
    placeholderData: (prev) => prev,
  });

  // Inline verification-email actions (contract-driven). Both stay on the
  // page: toast on success, then refresh the feed so the row updates.
  const queryClient = useQueryClient();
  const [toast, setToast] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // { candidateId, email } | null

  const refreshRows = () => queryClient.invalidateQueries({ queryKey: ['stuck-issues'] });

  const resend = useMutation({
    mutationFn: (candidateId) => apiResendVerification(candidateId),
    onSuccess: (res) => {
      setToast({
        message: res?.sent ? 'Verification email sent.' : 'Resend recorded — delivery pending.',
        type: res?.sent ? 'success' : 'warning',
      });
      refreshRows();
    },
    onError: (err) => {
      const status = err?.response?.status;
      const d = err?.response?.data || {};
      setToast({
        message: status === 429 && d.waitSeconds
          ? `Please wait ${d.waitSeconds}s before resending.`
          : d.error || d.message || 'Resend failed. Try again.',
        type: status === 429 ? 'warning' : 'error',
      });
    },
  });

  // Apply test filter, sort, then apply type filter for the visible list.
  // Pill counts are computed from the post-test-filter set so they reflect
  // what the user can actually see — toggling the test filter updates them.
  const allIssues = data?.data || [];

  const visibleAfterTestFilter = useMemo(() => {
    return hideTest ? allIssues.filter((i) => !i.isLikelyTest) : allIssues;
  }, [allIssues, hideTest]);

  const sorted = useMemo(() => {
    return [...visibleAfterTestFilter].sort((a, b) => {
      const sevA = SEVERITY_RANK[a.severity] ?? 0;
      const sevB = SEVERITY_RANK[b.severity] ?? 0;
      if (sevB !== sevA) return sevB - sevA; // high → low
      const ageA = new Date(getAge(a)).getTime() || 0;
      const ageB = new Date(getAge(b)).getTime() || 0;
      return ageB - ageA; // newest → oldest
    });
  }, [visibleAfterTestFilter]);

  const visible = useMemo(() => {
    if (activeType === 'all') return sorted;
    return sorted.filter((i) => i.type === activeType);
  }, [sorted, activeType]);

  // Pill counts from post-test-filter data (reactive to toggle)
  const pillCounts = useMemo(() => {
    const counts = { all: visibleAfterTestFilter.length };
    ISSUE_TYPES.forEach((t) => (counts[t] = 0));
    visibleAfterTestFilter.forEach((i) => {
      if (counts[i.type] != null) counts[i.type]++;
    });
    return counts;
  }, [visibleAfterTestFilter]);

  const totalRaw = data?.total ?? 0;

  // ── Loading ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div>
        <Header isLoading subtitle="" />
        <div className="stuck-state stuck-state-empty">
          <LoadingSpinner label="Loading stuck issues" />
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (isError) {
    return (
      <div>
        <Header subtitle="Could not load" />
        <ErrorState
          title="Could not load stuck issues"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div>
      <Header
        subtitle={`${totalRaw.toLocaleString()} requiring attention${
          isFetching ? ' · refreshing…' : ''
        }`}
        hideTest={hideTest}
        onToggleTest={() => setHideTest((v) => !v)}
      />

      {/* Notes panel (operations advisory) */}
      <NotesPanel notes={data?.notes} />

      {/* Type filter pills */}
      <div className="stuck-pills" role="tablist" aria-label="Filter by issue type">
        <Pill
          label="All"
          count={pillCounts.all}
          active={activeType === 'all'}
          onClick={() => setActiveType('all')}
        />
        {ISSUE_TYPES.map((t) => (
          <Pill
            key={t}
            label={PILL_LABELS[t] || humanizeStuckType(t)}
            count={pillCounts[t] || 0}
            active={activeType === t}
            onClick={() => setActiveType(t)}
          />
        ))}
      </div>

      {/* Issue list */}
      {totalRaw === 0 ? (
        <div className="stuck-state stuck-state-healthy">
          <span className="stuck-state-icon" aria-hidden="true">✓</span>
          All systems healthy
        </div>
      ) : visible.length === 0 ? (
        <div className="stuck-state stuck-state-empty">
          {activeType !== 'all'
            ? `No ${humanizeStuckType(activeType).toLowerCase()} issues${hideTest ? ' (test fixtures hidden)' : ''}.`
            : `No issues to show${hideTest ? ' — try toggling "Hide test"' : ''}.`}
        </div>
      ) : (
        <div className="stuck-list">
          {visible.map((issue, idx) => (
            <IssueCard
              key={`${issue.type}:${getTargetId(issue) || idx}`}
              issue={issue}
              onEditEmail={(candidateId, email) => setEditTarget({ candidateId, email })}
              onResend={(candidateId) => resend.mutate(candidateId)}
              resendingId={resend.isPending ? resend.variables : null}
            />
          ))}
        </div>
      )}

      <EditEmailModal
        open={!!editTarget}
        candidateId={editTarget?.candidateId}
        currentEmail={editTarget?.email}
        onClose={() => setEditTarget(null)}
        onComplete={({ email, mxWarning }) => {
          setToast(
            mxWarning
              ? { message: `Email updated to ${email}. MX warning: ${mxWarning}`, type: 'warning' }
              : { message: `Email updated to ${email}. Verification sent.`, type: 'success' },
          );
          refreshRows();
        }}
      />

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

/* ─── Header ─────────────────────────────────────────────────────────── */
function Header({ subtitle, hideTest, onToggleTest, isLoading }) {
  return (
    <header className="stuck-header">
      <div>
        <h1 className="stuck-title">Stuck Issues</h1>
        <div className="stuck-subtitle">{isLoading ? 'Loading…' : subtitle}</div>
      </div>
      {onToggleTest != null && (
        <label className="stuck-toggle">
          <input
            type="checkbox"
            checked={hideTest}
            onChange={onToggleTest}
            aria-label="Hide test/dryrun candidates"
          />
          Hide test/dryrun candidates
        </label>
      )}
    </header>
  );
}

/* ─── Notes panel ────────────────────────────────────────────────────── */
function NotesPanel({ notes }) {
  if (!notes) return null;
  if (typeof notes === 'string') {
    return (
      <div className="stuck-notes-panel">
        <div className="stuck-notes-header">Operations Notes</div>
        <div className="stuck-notes-list">{notes}</div>
      </div>
    );
  }
  if (typeof notes !== 'object' || Array.isArray(notes)) return null;

  const entries = Object.entries(notes).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number',
  );
  if (entries.length === 0) return null;

  return (
    <div className="stuck-notes-panel">
      <div className="stuck-notes-header">Operations Notes</div>
      <div className="stuck-notes-list">
        {entries.map(([k, v]) => (
          <div key={k}>
            <strong>{humanizeNoteKey(k)}:</strong> {String(v)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Pill ───────────────────────────────────────────────────────────── */
function Pill({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={'stuck-pill' + (active ? ' active' : '')}
      onClick={onClick}
    >
      {label}
      <span className="stuck-pill-count">{count}</span>
    </button>
  );
}

/* ─── Issue card ─────────────────────────────────────────────────────── */
function IssueCard({ issue, onEditEmail, onResend, resendingId }) {
  const message = getMessage(issue);
  const age = getAge(issue);
  const targetType = getTargetType(issue);
  const targetId = getTargetId(issue);
  const targetLabel = getTargetLabel(issue);

  const sev = issue.severity || 'low';
  const safeSev = SEVERITY_RANK[sev] ? sev : 'low';
  const cardClass = `stuck-card stuck-card-${safeSev}`;

  const candidateEmail = extractEmailFromMessage(message);

  return (
    <article className={cardClass}>
      <div className="stuck-card-header">
        <SeverityBadge severity={sev} />
        <span className="stuck-type">
          {issue.verificationEmail ? 'Verification email bounced' : humanizeStuckType(issue.type)}
        </span>
        {/* Failure-stage badge (simulator items only carry failureStage).
            Tinted by the item's own severity so provider_quota/scoring_error
            (high) read differently from routine drops (low). */}
        {issue.failureStage && (
          <span
            className={`stuck-stage-badge stuck-stage-badge-${safeSev}`}
            title="Simulator failure stage"
          >
            {humanizeStage(issue.failureStage)}
          </span>
        )}
        {issue.isLikelyTest && (
          <span className="stuck-test-badge" title="Looks like a test/dryrun account">
            Test
          </span>
        )}
        <span className="stuck-age" title={age}>
          {age ? timeAgo(age) : ''}
        </span>
      </div>

      <div className="stuck-card-body">
        {(targetLabel || targetId) && (
          <div className="stuck-target">
            {targetLabel && <span className="stuck-target-label">{targetLabel}</span>}
            {targetId && (
              <span className="stuck-target-id" title={`${targetType || ''} id`}>
                {targetType ? `${targetType}:` : ''}{targetId}
              </span>
            )}
          </div>
        )}
        {message && <div className="stuck-description">{message}</div>}
      </div>

      <div className="stuck-card-actions">
        <IssueActions
          issue={issue}
          candidateEmail={candidateEmail}
          onEditEmail={onEditEmail}
          onResend={onResend}
          resendingId={resendingId}
        />
      </div>
    </article>
  );
}

/* ─── Type-specific actions ──────────────────────────────────────────── */
function IssueActions({ issue, candidateEmail, onEditEmail, onResend, resendingId }) {
  switch (issue.type) {
    case 'failedMint':
      return (
        <button
          type="button"
          className="stuck-action-btn"
          disabled
          title="Retry mint endpoint not yet wired in admin API"
        >
          Retry Mint
        </button>
      );

    case 'stuckAssessment':
      if (candidateEmail) {
        return (
          <Link
            to={`/credentials?search=${encodeURIComponent(candidateEmail)}`}
            className="stuck-action-btn"
            title={`View credentials for ${candidateEmail}`}
          >
            View Candidate
          </Link>
        );
      }
      return (
        <button
          type="button"
          className="stuck-action-btn"
          disabled
          title="Could not parse candidate email from message"
        >
          View Candidate
        </button>
      );

    case 'emailBounce':
      // Verification-email bounces carry candidateId + the two admin endpoints
      // in actions{}. Offer the one-click fix inline; stay on the page.
      if (issue.verificationEmail && issue.candidateId) {
        const resending = resendingId === issue.candidateId;
        return (
          <>
            <button
              type="button"
              className="stuck-action-btn"
              onClick={() => onEditEmail(issue.candidateId, candidateEmail)}
            >
              Edit email
            </button>
            <button
              type="button"
              className="stuck-action-btn"
              disabled={resending}
              onClick={() => onResend(issue.candidateId)}
            >
              {resending ? 'Sending…' : 'Resend verification'}
            </button>
          </>
        );
      }
      return (
        <button
          type="button"
          className="stuck-action-btn"
          disabled
          title="Re-send endpoint not yet wired"
        >
          Re-send Email
        </button>
      );

    case 'undeliveredCredential':
      return (
        <button
          type="button"
          className="stuck-action-btn"
          disabled
          title="Re-send credential endpoint not yet wired"
        >
          Re-send Credential Email
        </button>
      );

    case 'simulatorFailure':
      // Link target is candidateId (NOT targetId, which is the session id).
      if (issue.candidateId) {
        return (
          <Link
            to={`/candidates/${issue.candidateId}`}
            className="stuck-action-btn"
            title="View candidate detail"
          >
            View Candidate
          </Link>
        );
      }
      return (
        <button
          type="button"
          className="stuck-action-btn"
          disabled
          title="No candidate id on this item"
        >
          View Candidate
        </button>
      );

    default:
      return null;
  }
}
