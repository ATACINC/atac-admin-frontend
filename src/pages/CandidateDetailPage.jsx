import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiGetCandidate,
  apiClearSimulatorCooldown,
  apiResetSimulatorAttempt,
  apiForceSimulatorRetry,
  apiResendVerification,
  apiUnarchiveCandidate,
} from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import Toast from '../components/Toast';
import SimulatorActionModal from '../components/SimulatorActionModal';
import ResetPasswordModal from '../components/ResetPasswordModal';
import EditEmailModal from '../components/EditEmailModal';
import ArchiveCandidateModal from '../components/ArchiveCandidateModal';
import { timeAgo } from '../utils/timeAgo';
import { formatLongDate } from '../utils/format';
import './CandidateDetailPage.css';

// Failure stages an operator can act on (provider problems) vs routine,
// candidate-driven drops. Drives the chip color so an admin can tell at a
// glance whether an attempt failed for a reason worth chasing.
const ACTIONABLE_STAGES = new Set(['provider_quota', 'scoring_error', 'provider_network']);
const ROUTINE_STAGES = new Set(['short_hangup', 'silence_timeout', 'incomplete_call']);

const SCORE_DIMS = [
  ['greeting', 'Greeting'],
  ['empathy', 'Empathy'],
  ['resolution', 'Resolution'],
  ['tone', 'Tone'],
  ['close', 'Close'],
];

function humanizeToken(token) {
  if (!token) return '';
  return String(token)
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function fmtDuration(seconds) {
  if (seconds == null) return '--';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

// Derive a journey label from the data the detail endpoint returns (it
// does not ship a top-level status). Mirrors the list page's badge labels.
function deriveJourney(cand) {
  const creds = cand.credentials || [];
  const asmts = cand.assessments || [];
  if (creds.length > 0) return { label: 'Credential Issued', cls: 'cand-badge-credentialed' };
  if (asmts.some((a) => a.completedAt || a.passed != null)) {
    return { label: 'Assessed', cls: 'cand-badge-assessed' };
  }
  if (asmts.some((a) => a.startedAt)) return { label: 'In Progress', cls: 'cand-badge-inprogress' };
  return { label: 'Registered', cls: 'cand-badge-registered' };
}

// The session reset-attempt would target: the most recent attempt by
// createdAt. Used so the confirm modal can show its status + age and warn
// before an admin terminates a live in_progress call.
function latestSession(sessions) {
  if (!sessions || sessions.length === 0) return null;
  return [...sessions].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  })[0];
}

export default function CandidateDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [toast, setToast] = useState(null); // { message, type }
  const [openAction, setOpenAction] = useState(null); // null | 'clear' | 'reset' | 'force' | 'password' | 'editEmail' | 'archive'
  const [resendCooldown, setResendCooldown] = useState(0); // seconds; >0 disables Resend Verification

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => apiGetCandidate(id),
    placeholderData: (prev) => prev,
    retry: (failureCount, err) => {
      if (err?.response?.status === 404) return false;
      return failureCount < 1;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['candidate', id] });

  const closeAction = () => setOpenAction(null);

  // ── Mutations (invalidate the candidate query on success so the page
  //    refreshes with the new cooldown / attempt state) ────────────────
  const clearCooldown = useMutation({
    mutationFn: () => apiClearSimulatorCooldown(id),
    onSuccess: (res) => {
      invalidate();
      closeAction();
      setToast({
        message: res?.alreadyClear ? 'No active cooldown to clear.' : 'Cooldown cleared.',
        type: 'success',
      });
    },
  });

  const resetAttempt = useMutation({
    mutationFn: () => apiResetSimulatorAttempt(id),
    onSuccess: (res) => {
      invalidate();
      closeAction();
      setToast({
        message: res?.alreadyClear
          ? 'No resettable attempt found.'
          : `Attempt reset${res?.priorStatus ? ` (was ${res.priorStatus})` : ''}.`,
        type: 'success',
      });
    },
  });

  const forceRetry = useMutation({
    mutationFn: () => apiForceSimulatorRetry(id),
    onSuccess: (res) => {
      invalidate();
      closeAction();
      const parts = [];
      if (res?.cooldownCleared) parts.push('cooldown cleared');
      if (res?.attemptReset) parts.push('attempt reset');
      setToast({
        message: parts.length ? `Force retry: ${parts.join(', ')}.` : 'Force retry applied.',
        type: 'success',
      });
    },
  });

  // Resend-verification cooldown countdown, seeded from a 429 waitSeconds.
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setInterval(() => setResendCooldown((s) => (s > 1 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const resendVerification = useMutation({
    mutationFn: () => apiResendVerification(id),
    onSuccess: (res) => {
      invalidate();
      setToast({
        message: res?.sent ? 'Verification email sent.' : 'Resend recorded — delivery pending.',
        type: res?.sent ? 'success' : 'warning',
      });
    },
    onError: (err) => {
      const status = err?.response?.status;
      const d = err?.response?.data || {};
      if (status === 429 && d.waitSeconds) {
        setResendCooldown(d.waitSeconds);
        setToast({ message: `Please wait ${d.waitSeconds}s before resending.`, type: 'warning' });
      } else {
        setToast({ message: d.error || d.message || 'Resend failed. Try again.', type: 'error' });
      }
    },
  });

  const unarchive = useMutation({
    mutationFn: () => apiUnarchiveCandidate(id),
    onSuccess: () => {
      invalidate();
      setToast({ message: 'Candidate unarchived.', type: 'success' });
    },
    onError: (err) => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Unarchive failed. Try again.',
        type: 'error',
      });
    },
  });

  const mutationError = (m) =>
    m.isError
      ? m.error?.response?.data?.error || m.error?.message || 'Action failed. Try again.'
      : '';

  // ── Loading ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="detail-page">
        <div className="detail-state">
          <LoadingSpinner label="Loading candidate" />
        </div>
      </div>
    );
  }

  const is404 = isError && error?.response?.status === 404;
  if (is404) {
    return (
      <div className="detail-page">
        <Link to="/candidates" className="detail-back">
          ← Candidates
        </Link>
        <div className="detail-state">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--white)', marginBottom: 8 }}>
            Candidate not found
          </div>
          <div style={{ fontSize: 13 }}>
            <code style={{ color: 'var(--gold)' }}>{id}</code> doesn't exist or has been removed.
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="detail-page">
        <Link to="/candidates" className="detail-back">
          ← Candidates
        </Link>
        <ErrorState
          title="Could not load candidate"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────
  const cand = data;
  const journey = deriveJourney(cand);
  const assessments = cand.assessments || [];
  const sessions = cand.simulatorSessions || [];
  const credentials = cand.credentials || [];
  const cooldowns = cand.cooldowns || {};
  const target = latestSession(sessions);
  const targetInProgress = target?.status === 'in_progress';

  return (
    <div className="detail-page">
      <button
        type="button"
        className="detail-back"
        onClick={() => navigate('/candidates')}
      >
        ← Candidates
      </button>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="detail-card">
        <div className="cd-header-top">
          <div>
            <h2 className="cand-name-big">{cand.name || '--'}</h2>
            {cand.email && <div className="cand-email-small">{cand.email}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {cand.archivedAt && <span className="cand-badge cand-badge-archived">Archived</span>}
            <span className={`cand-badge ${journey.cls}`}>{journey.label}</span>
          </div>
        </div>

        <div className="cd-meta-row">
          <div>
            <span className="meta-label">Joined</span>
            <span title={cand.createdAt} style={{ color: 'var(--white)' }}>
              {cand.createdAt ? timeAgo(cand.createdAt) : '--'}
            </span>
          </div>
          <div>
            <span className="meta-label">Payment</span>
            <span style={{ color: cand.paymentVerified ? 'var(--teal-2)' : 'var(--muted)' }}>
              {cand.paymentVerified ? `Verified${cand.paymentTier ? ` (${cand.paymentTier})` : ''}` : 'Unpaid'}
            </span>
          </div>
          <div>
            <span className="meta-label">Email</span>
            <span style={{ color: cand.emailVerified ? 'var(--teal-2)' : 'var(--muted)' }}>
              {cand.emailVerified ? 'Verified' : 'Unverified'}
            </span>
          </div>

          <div className="cd-action-toolbar">
            <button
              type="button"
              className="cd-action-btn"
              onClick={() => setOpenAction('clear')}
            >
              Clear Cooldown
            </button>
            <button
              type="button"
              className="cd-action-btn cd-action-btn-amber"
              onClick={() => setOpenAction('force')}
            >
              Force Retry
            </button>
            <button
              type="button"
              className="cd-action-btn cd-action-btn-danger"
              onClick={() => setOpenAction('reset')}
            >
              Reset Attempt
            </button>
            {cand.email && (
              <button
                type="button"
                className="cd-action-btn"
                onClick={() => setOpenAction('password')}
              >
                Reset Password
              </button>
            )}
            {cand.email && (
              <button
                type="button"
                className="cd-action-btn"
                onClick={() => setOpenAction('editEmail')}
              >
                Edit Email
              </button>
            )}
            {cand.email && !cand.emailVerified && (
              <button
                type="button"
                className="cd-action-btn"
                disabled={resendVerification.isPending || resendCooldown > 0}
                onClick={() => resendVerification.mutate()}
              >
                {resendCooldown > 0
                  ? `Resend Verification (${resendCooldown}s)`
                  : resendVerification.isPending
                    ? 'Sending…'
                    : 'Resend Verification'}
              </button>
            )}
            {cand.archivedAt ? (
              <button
                type="button"
                className="cd-action-btn"
                disabled={unarchive.isPending}
                onClick={() => unarchive.mutate()}
              >
                {unarchive.isPending ? 'Unarchiving…' : 'Unarchive'}
              </button>
            ) : (
              <button
                type="button"
                className="cd-action-btn cd-action-btn-danger"
                onClick={() => setOpenAction('archive')}
              >
                Archive
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Cooldowns (both rendered) ────────────────────────────── */}
      <div className="detail-card">
        <div className="detail-section-label">Cooldowns</div>
        <div className="cd-cooldown-grid">
          <RetakeCooldown cd={cooldowns.retake} />
          <IncompleteCooldown cd={cooldowns.incompleteAbuse} />
        </div>
      </div>

      {/* ── Journey ──────────────────────────────────────────────── */}

      {/* 1. Registered */}
      <div className="detail-card cd-journey-step">
        <div className="cd-step-rail" />
        <div className="cd-step-body">
          <div className="detail-section-label">1 · Registered</div>
          <div className="cd-step-line">
            Account created <strong>{cand.createdAt ? timeAgo(cand.createdAt) : '--'}</strong>
            <span className="cd-step-sub" title={cand.createdAt}>{formatLongDate(cand.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* 2. Assessment */}
      <div className="detail-card cd-journey-step">
        <div className="cd-step-rail" />
        <div className="cd-step-body">
          <div className="cd-step-head">
            <div className="detail-section-label">2 · Assessment</div>
            <Link to="/assessments/anomalies" className="cd-inline-link">
              View assessment anomalies ↗
            </Link>
          </div>
          {assessments.length === 0 ? (
            <div className="cd-empty">No assessment attempts yet.</div>
          ) : (
            <>
              <div className="cd-step-line" style={{ marginBottom: 10 }}>
                <strong>{assessments.length}</strong> attempt{assessments.length === 1 ? '' : 's'}
              </div>
              <div className="cd-asmt-list">
                {assessments.map((a) => (
                  <div className="cd-asmt-row" key={a.id}>
                    <span className={
                      'cd-asmt-result ' +
                      (a.passed === true ? 'cd-pass' : a.passed === false ? 'cd-fail' : 'cd-neutral')
                    }>
                      {a.passed === true ? '✓ Pass' : a.passed === false ? '✗ Fail' : (a.status || 'In progress')}
                    </span>
                    <span className="cd-asmt-score">
                      {a.percentage != null ? `${a.percentage}%` : '--'}
                      {a.score != null && <span className="cd-asmt-pts"> · {a.score} pts</span>}
                    </span>
                    <span className="cd-asmt-when" title={a.completedAt || a.createdAt}>
                      {a.completedAt ? timeAgo(a.completedAt) : a.createdAt ? timeAgo(a.createdAt) : '--'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. Simulator attempts */}
      <div className="detail-card cd-journey-step">
        <div className="cd-step-rail" />
        <div className="cd-step-body">
          <div className="detail-section-label">3 · Call Readiness Simulator</div>
          {sessions.length === 0 ? (
            <div className="cd-empty">No simulator attempts yet.</div>
          ) : (
            <div className="cd-sim-list">
              {[...sessions]
                .sort((a, b) => (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0)))
                .map((s) => (
                  <SimulatorAttempt key={s.id} s={s} />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. Credential */}
      <div className="detail-card cd-journey-step">
        <div className="cd-step-rail" />
        <div className="cd-step-body">
          <div className="detail-section-label">4 · Credential</div>
          {credentials.length === 0 ? (
            <div className="cd-empty">No credential issued.</div>
          ) : (
            <div className="cd-cred-list">
              {credentials.map((cr) => (
                <Link key={cr.credentialId} to={`/credentials/${cr.credentialId}`} className="cd-cred-row">
                  <span className="cd-cred-id">{cr.credentialId}</span>
                  <span className="cd-cred-program">{cr.program || '--'}</span>
                  <span className={
                    'cd-cred-status ' +
                    (cr.isRevoked ? 'cd-fail' : cr.isExpired ? 'cd-neutral' : 'cd-pass')
                  }>
                    {cr.isRevoked ? 'Revoked' : cr.isExpired ? 'Expired' : (cr.status || 'Active')}
                  </span>
                  <span className="cd-cred-when" title={cr.issuedAt}>
                    {cr.issuedAt ? `Issued ${timeAgo(cr.issuedAt)}` : '--'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Action modals ────────────────────────────────────────── */}
      <SimulatorActionModal
        open={openAction === 'clear'}
        title="Clear Cooldown"
        confirmLabel="Clear Cooldown"
        confirmingLabel="Clearing..."
        confirming={clearCooldown.isPending}
        error={mutationError(clearCooldown)}
        onConfirm={() => clearCooldown.mutate()}
        onClose={() => { clearCooldown.reset(); closeAction(); }}
      >
        <p style={{ margin: '0 0 10px' }}>
          Clear any active simulator cooldown for <strong>{cand.name || cand.email || 'this candidate'}</strong>?
        </p>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
          This removes both the retake and the short incomplete-attempt holds so the candidate
          can start a new attempt immediately. It does not change any existing attempt or score.
        </p>
      </SimulatorActionModal>

      <SimulatorActionModal
        open={openAction === 'force'}
        title="Force Retry"
        tone="amber"
        confirmLabel="Force Retry"
        confirmingLabel="Applying..."
        confirming={forceRetry.isPending}
        error={mutationError(forceRetry)}
        onConfirm={() => forceRetry.mutate()}
        onClose={() => { forceRetry.reset(); closeAction(); }}
      >
        <p style={{ margin: '0 0 10px' }}>
          Force a fresh retry for <strong>{cand.name || cand.email || 'this candidate'}</strong>?
        </p>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
          This clears the cooldown and resets the most recent attempt in one step.
          {target && (
            <> Target attempt: <strong style={{ color: 'var(--white)' }}>{humanizeToken(target.status)}</strong>, created {target.createdAt ? timeAgo(target.createdAt) : '--'}.</>
          )}
        </p>
        {targetInProgress && (
          <p style={{ margin: '10px 0 0', color: 'var(--red)', fontSize: 13 }}>
            Warning: the most recent attempt is in progress. Forcing a retry may interrupt a live call.
          </p>
        )}
      </SimulatorActionModal>

      <SimulatorActionModal
        open={openAction === 'reset'}
        title="Reset Attempt"
        tone="amber"
        confirmLabel="Reset Attempt"
        confirmingLabel="Resetting..."
        confirming={resetAttempt.isPending}
        error={mutationError(resetAttempt)}
        onConfirm={() => resetAttempt.mutate()}
        onClose={() => { resetAttempt.reset(); closeAction(); }}
      >
        <p style={{ margin: '0 0 12px' }}>
          Reset the most recent simulator attempt for <strong>{cand.name || cand.email || 'this candidate'}</strong>?
        </p>
        {target ? (
          <div className="cd-reset-target">
            <div className="cd-reset-row">
              <span className="cd-reset-k">Scenario</span>
              <span className="cd-reset-v">{target.scenarioCode || '--'}</span>
            </div>
            <div className="cd-reset-row">
              <span className="cd-reset-k">Status</span>
              <span className="cd-reset-v" style={{ color: targetInProgress ? 'var(--red)' : 'var(--white)' }}>
                {humanizeToken(target.status) || '--'}
              </span>
            </div>
            <div className="cd-reset-row">
              <span className="cd-reset-k">Age</span>
              <span className="cd-reset-v" title={target.createdAt}>
                {target.createdAt ? timeAgo(target.createdAt) : '--'}
              </span>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            No simulator attempt on record. The backend will report nothing to reset.
          </p>
        )}
        {targetInProgress && (
          <p style={{ margin: '12px 0 0', color: 'var(--red)', fontSize: 13, lineHeight: 1.5 }}>
            Warning: this attempt is in progress. Resetting it will terminate a live call. Only proceed
            if you are sure the call is stuck.
          </p>
        )}
      </SimulatorActionModal>

      <ResetPasswordModal
        open={openAction === 'password'}
        candidateEmail={cand.email}
        candidateName={cand.name}
        onClose={closeAction}
        onComplete={({ outcome }) => {
          if (outcome === 'success') {
            setToast({ message: `Temporary password emailed to ${cand.email}`, type: 'success' });
          }
          closeAction();
        }}
      />

      <EditEmailModal
        open={openAction === 'editEmail'}
        candidateId={id}
        currentEmail={cand.email}
        candidateName={cand.name}
        onClose={closeAction}
        onComplete={({ email, mxWarning }) => {
          invalidate();
          setToast(
            mxWarning
              ? { message: `Email updated to ${email}. MX warning: ${mxWarning}`, type: 'warning' }
              : { message: `Email updated to ${email}. Verification sent.`, type: 'success' },
          );
        }}
      />

      <ArchiveCandidateModal
        open={openAction === 'archive'}
        candidateId={id}
        candidateName={cand.name}
        candidateEmail={cand.email}
        onClose={closeAction}
        onComplete={() => {
          invalidate();
          setToast({ message: 'Candidate archived.', type: 'success' });
        }}
      />

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function RetakeCooldown({ cd }) {
  const active = cd && cd.inCooldown;
  return (
    <div className={'cd-cooldown-cell' + (active ? ' cd-cooldown-active' : '')}>
      <div className="cd-cooldown-label">Retake (24h scored-fail)</div>
      {active ? (
        <>
          <div className="cd-cooldown-value">
            {cd.hoursRemaining != null ? `${cd.hoursRemaining}h remaining` : 'Active'}
          </div>
          <div className="cd-cooldown-sub">
            {cd.endsAt && <>Ends <span title={cd.endsAt}>{formatLongDate(cd.endsAt)}</span></>}
            {cd.lastEventAt && <> · last fail {timeAgo(cd.lastEventAt)}</>}
          </div>
        </>
      ) : (
        <div className="cd-cooldown-clear">No active cooldown</div>
      )}
    </div>
  );
}

function IncompleteCooldown({ cd }) {
  const active = cd && cd.inCooldown;
  const count = cd?.incompleteCount ?? 0;
  return (
    <div className={'cd-cooldown-cell' + (active ? ' cd-cooldown-active' : '')}>
      <div className="cd-cooldown-label">Incomplete-attempt hold</div>
      {active ? (
        <>
          <div className="cd-cooldown-value">
            {cd.minutesRemaining != null ? `${cd.minutesRemaining} min remaining` : 'Active'}
          </div>
          <div className="cd-cooldown-sub">
            {/* Surface the count so a briefly-held candidate reads as intentional,
                not a broken button. */}
            {count} incomplete attempt{count === 1 ? '' : 's'} on record
            {cd.lastEventAt && <> · last {timeAgo(cd.lastEventAt)}</>}
          </div>
        </>
      ) : (
        <div className="cd-cooldown-clear">
          No active hold
          {count > 0 && <span className="cd-cooldown-count"> · {count} incomplete on record</span>}
        </div>
      )}
    </div>
  );
}

function SimulatorAttempt({ s }) {
  const stage = s.failureStage || null;
  const actionable = stage && ACTIONABLE_STAGES.has(stage);
  const routine = stage && ROUTINE_STAGES.has(stage);
  const score = s.score || null;

  return (
    <div className="cd-sim-row">
      <div className="cd-sim-top">
        <span className={
          'cd-sim-status ' +
          (s.status === 'scored' ? 'cd-pass'
            : s.status === 'in_progress' ? 'cd-neutral'
            : s.failureStage ? 'cd-fail' : 'cd-neutral')
        }>
          {humanizeToken(s.status) || '--'}
        </span>
        {s.scenarioCode && <span className="cd-sim-scenario">{s.scenarioCode}</span>}
        {stage && (
          <span className={
            'cd-stage-chip ' +
            (actionable ? 'cd-stage-actionable' : routine ? 'cd-stage-routine' : 'cd-stage-unknown')
          }>
            {actionable ? 'Actionable · ' : ''}{humanizeToken(stage)}
          </span>
        )}
        <span className="cd-sim-when" title={s.createdAt}>
          {s.createdAt ? timeAgo(s.createdAt) : '--'}
          {s.durationSeconds != null && <> · {fmtDuration(s.durationSeconds)}</>}
        </span>
      </div>

      {(s.errorCode || s.errorMessage) && (
        <div className="cd-sim-error">
          {s.errorCode && <code className="cd-sim-errcode">{s.errorCode}</code>}
          {s.errorMessage && <span className="cd-sim-errmsg">{s.errorMessage}</span>}
        </div>
      )}

      {score && (
        <div className="cd-sim-score-block">
          <div className="cd-sim-score-head">
            <span className={'cd-sim-overall ' + (score.passFail ? 'cd-pass' : 'cd-fail')}>
              {score.overall != null ? score.overall : '--'}
              <span className="cd-sim-overall-label"> overall · {score.passFail ? 'Pass' : 'Fail'}</span>
            </span>
            {score.model && <span className="cd-sim-model">{score.model}</span>}
          </div>
          <div className="cd-sim-dims">
            {SCORE_DIMS.map(([k, label]) => (
              <div className="cd-sim-dim" key={k}>
                <span className="cd-sim-dim-label">{label}</span>
                <span className="cd-sim-dim-val">{score[k] != null ? score[k] : '--'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {s.credentialId && (
        <Link to={`/credentials/${s.credentialId}`} className="cd-sim-cred-link">
          {s.credentialId} ↗
        </Link>
      )}
    </div>
  );
}
