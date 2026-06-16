import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGetCandidates } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import Toast from '../components/Toast';
import ResetPasswordModal from '../components/ResetPasswordModal';
import { timeAgo } from '../utils/timeAgo';
import { truncateMiddle } from '../utils/format';
import { isDraftWeighting, isAssessmentOnly, fmtScore, passClass } from '../utils/scoreDisplay';
import './CandidatesListPage.css';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

// Filter dropdown labels → backend journeyState param.
// 'all' is the no-filter sentinel. Backend supports 4 journey states; we expose
// all 4 so candidates in 'started' (assessment begun but never completed) are
// reachable. (Brief omitted this fourth option — confirmed gap, see handoff.)
const FILTERS = [
  { value: 'all',          label: 'All Candidates',  journeyState: null          },
  { value: 'credentialed', label: 'Credential Issued', journeyState: 'credentialed' },
  { value: 'completed',    label: 'Assessed',         journeyState: 'completed'   },
  { value: 'started',      label: 'In Progress',      journeyState: 'started'     },
  { value: 'registered',   label: 'Registered Only',  journeyState: 'registered'  },
];

export default function CandidatesListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL state (canonical) ─────────────────────────────────────
  const status = searchParams.get('status') || 'all';
  const searchUrl = searchParams.get('search') || '';
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

  // ── Local input state for snappy typing; debounced into URL ──
  const [searchInput, setSearchInput] = useState(searchUrl);

  useEffect(() => {
    setSearchInput(searchUrl);
  }, [searchUrl]);

  useEffect(() => {
    if (searchInput === searchUrl) return;
    const t = setTimeout(() => {
      updateParams({ search: searchInput || null, offset: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const updateParams = (updates) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '' || v === 'all') {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    });
    setSearchParams(next);
  };

  const onStatusChange = (e) => {
    updateParams({ status: e.target.value, offset: null });
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  const onPageChange = (nextPage) => {
    updateParams({ offset: (nextPage - 1) * PAGE_SIZE });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const hasFilters = status !== 'all' || !!searchUrl;

  // ── Map dropdown value → journeyState backend param ──────────
  const selectedFilter = FILTERS.find((f) => f.value === status) || FILTERS[0];

  const queryParams = {
    limit: PAGE_SIZE,
    offset,
    ...(selectedFilter.journeyState && { journeyState: selectedFilter.journeyState }),
    ...(searchUrl && { search: searchUrl }),
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['candidates', queryParams],
    queryFn: () => apiGetCandidates(queryParams),
    placeholderData: (prev) => prev,
  });

  const rows = data?.data || [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  // ── Navigate row click → candidate detail page ───────────────
  const goToCandidate = (candidate) => {
    if (!candidate?.id) return;
    navigate(`/candidates/${candidate.id}`);
  };

  // ── Reset-password modal state ───────────────────────────────
  const [resetTarget, setResetTarget] = useState(null); // { email, name } | null
  const [toast, setToast] = useState(null);             // { message, type } | null

  const openResetModal = (candidate) => {
    if (!candidate?.email) return;
    setResetTarget({ email: candidate.email, name: candidate.name });
  };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="cands-header">
        <div>
          <h1 className="cands-title">Candidates</h1>
          <div className="cands-subtitle">
            {isLoading ? 'Loading…' : `${total.toLocaleString()} total`}
          </div>
        </div>
      </header>

      {/* ── Filters ────────────────────────────────────────── */}
      <div className="cands-filters">
        <input
          type="search"
          className="cands-search"
          placeholder="Search by name or email"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search candidates"
        />
        <select
          className="cands-select"
          value={status}
          onChange={onStatusChange}
          aria-label="Filter by journey state"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button type="button" className="cands-clear" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
        {isFetching && !isLoading && (
          <span className="cands-fetching" aria-live="polite">
            Refreshing…
          </span>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      {isError ? (
        <ErrorState
          title="Could not load candidates"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      ) : isLoading ? (
        <div className="cands-state">
          <LoadingSpinner label="Loading candidates" />
        </div>
      ) : rows.length === 0 ? (
        <div className="cands-state">
          <div>No candidates match your filters.</div>
          {hasFilters && (
            <button type="button" className="cands-empty-action" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={'cands-table-wrap' + (isFetching && !isLoading ? ' is-stale' : '')}>
            <table className="cands-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Wallet</th>
                  <th>Status</th>
                  <th>Latest Score</th>
                  <th>Joined</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    onNavigate={goToCandidate}
                    onReset={openResetModal}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={onPageChange}
          />
        </>
      )}

      {resetTarget && (
        <ResetPasswordModal
          open={!!resetTarget}
          candidateEmail={resetTarget.email}
          candidateName={resetTarget.name}
          onClose={() => setResetTarget(null)}
          onComplete={({ outcome }) => {
            if (outcome === 'success') {
              setToast({
                message: `Temporary password emailed to ${resetTarget.email}`,
                type: 'success',
              });
            }
            setResetTarget(null);
          }}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function CandidateRow({ candidate, onNavigate, onReset }) {
  const handleRowClick = () => onNavigate(candidate);
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNavigate(candidate);
    }
  };
  const stopRow = (e) => e.stopPropagation();
  const handleResetClick = (e) => {
    e.stopPropagation();
    onReset(candidate);
  };

  const detailLink = `/candidates/${candidate.id}`;
  const canReset = !!candidate.email;

  return (
    <tr
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View candidate ${candidate.name || candidate.email}`}
    >
      <td className="cell-name">{candidate.name || '—'}</td>
      <td className="cell-email">{candidate.email || '—'}</td>
      <td>
        {candidate.walletAddress ? (
          <span className="cell-wallet" title={candidate.walletAddress}>
            {truncateMiddle(candidate.walletAddress, 16)}
          </span>
        ) : (
          <span className="cell-wallet-empty">no wallet</span>
        )}
      </td>
      <td>
        <CandidateStatusBadge status={candidate.status} />
      </td>
      <td>
        <ScoreTrioCell
          assessment={candidate.latestAssessment}
          credential={candidate.latestCredential}
        />
      </td>
      <td className="cell-joined" title={candidate.createdAt}>
        {candidate.createdAt ? timeAgo(candidate.createdAt) : '—'}
      </td>
      <td className="cell-actions">
        <Link to={detailLink} onClick={stopRow}>
          View
        </Link>
        {canReset && (
          <button
            type="button"
            className="cell-action-reset"
            onClick={handleResetClick}
            aria-label={`Reset password for ${candidate.name || candidate.email}`}
          >
            Reset Password
          </button>
        )}
      </td>
    </tr>
  );
}

const STATUS_BADGE_CONFIG = {
  credentialed: { label: 'Credential Issued', className: 'cand-badge-credentialed' },
  completed:    { label: 'Assessed',          className: 'cand-badge-assessed' },
  started:      { label: 'In Progress',       className: 'cand-badge-inprogress' },
  registered:   { label: 'Registered',        className: 'cand-badge-registered' },
};

function CandidateStatusBadge({ status }) {
  const cfg = STATUS_BADGE_CONFIG[status] || STATUS_BADGE_CONFIG.registered;
  return <span className={`cand-badge ${cfg.className}`}>{cfg.label}</span>;
}

// Three-value cell: assessment / simulator / combined. Branches on the
// candidate's stage so we never render fake combined scores or
// misleading dashes:
//   - Pre-credential (no latestCredential): just the assessment value
//     (or em-dash placeholder for true empty), same as the old cell.
//   - Credential, assessment-only (Pioneers, no sim done): show A only
//     plus the NEEDS SIM upgrade tag, with S and C as muted "--".
//   - Credential, full sim: A / S / C all rendered, C in gold with the
//     DRAFT pill while the weighting version starts with "DRAFT".
function ScoreTrioCell({ assessment, credential }) {
  const hasAssessment = assessment && assessment.percentage != null;

  // No credential yet, nothing or assessment only: preserve the pre-
  // Phase 3 single-value rendering so pre-credential rows stay clean.
  if (!credential) {
    if (!hasAssessment) {
      return <span className="cell-score cell-score-empty">--</span>;
    }
    const cls = 'cell-score ' + (
      assessment.passed === true ? 'cell-score-pass'
        : assessment.passed === false ? 'cell-score-fail'
        : ''
    );
    return <span className={cls}>{assessment.percentage}%</span>;
  }

  // Has a credential. Render the trio.
  const aValue = hasAssessment ? `${assessment.percentage}%` : '--';
  const aCls = !hasAssessment
    ? 'cell-trio-value cell-trio-muted'
    : 'cell-trio-value ' + (
        assessment.passed === true ? 'cell-score-pass'
          : assessment.passed === false ? 'cell-score-fail'
          : ''
      );

  const assessmentOnly = isAssessmentOnly(credential);
  const draftBadge = isDraftWeighting(credential.combinedWeightingVersion);

  return (
    <div className="cell-trio">
      <span className="cell-trio-pair">
        <span className="cell-trio-label">A</span>
        <span className={aCls}>{aValue}</span>
      </span>
      <span className="cell-trio-pair">
        <span className="cell-trio-label">S</span>
        <span className={
          credential.simulatorScore != null
            ? 'cell-trio-value cell-trio-sim ' + (passClass(credential.simulatorScore) === 'fail' ? 'cell-score-fail' : '')
            : 'cell-trio-value cell-trio-muted'
        }>
          {fmtScore(credential.simulatorScore)}
        </span>
      </span>
      <span className="cell-trio-pair">
        <span className="cell-trio-label">C</span>
        <span className={
          credential.combinedScore != null
            ? 'cell-trio-value cell-trio-combined'
            : 'cell-trio-value cell-trio-muted'
        }>
          {fmtScore(credential.combinedScore)}
        </span>
        {draftBadge && !assessmentOnly && (
          <span className="cand-badge cand-badge-draft" title={credential.combinedWeightingVersion}>
            Draft
          </span>
        )}
      </span>
      {assessmentOnly && (
        <span className="cand-badge cand-badge-needs-sim" title="Eligible to take the Call Readiness Simulator">
          Needs Sim
        </span>
      )}
    </div>
  );
}
