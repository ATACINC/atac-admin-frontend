import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGetKpis, apiGetActivity, apiGetStuckIssues } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import { timeAgo } from '../utils/timeAgo';
import { humanizeAction, humanizeTargetType, actionTone } from '../utils/humanize';
import './DashboardPage.css';

const ACTIVITY_LIMIT = 15;

// ── byType key → display config (label + severity dot) ──────────────────
const STUCK_TYPE_CONFIG = {
  failedMint: { singular: 'Failed mint', plural: 'Failed mints', tone: 'red' },
  stuckAssessment: { singular: 'Stuck assessment', plural: 'Stuck assessments', tone: 'amber' },
  emailBounce: { singular: 'Email bounce', plural: 'Email bounces', tone: 'amber' },
  undeliveredCredential: { singular: 'Undelivered credential', plural: 'Undelivered credentials', tone: 'red' },
};

// Render unknown byType keys as humanized labels with a muted dot.
function stuckTypeConfig(key) {
  if (STUCK_TYPE_CONFIG[key]) return STUCK_TYPE_CONFIG[key];
  const spaced = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().toLowerCase();
  const cap = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  return { singular: cap, plural: cap, tone: 'muted' };
}

export default function DashboardPage() {
  const queryClient = useQueryClient();

  const kpisQ = useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: apiGetKpis,
  });

  const activityQ = useQuery({
    queryKey: ['dashboard', 'activity', { limit: ACTIVITY_LIMIT }],
    queryFn: () => apiGetActivity({ limit: ACTIVITY_LIMIT }),
  });

  const stuckQ = useQuery({
    queryKey: ['dashboard', 'stuck'],
    queryFn: apiGetStuckIssues,
  });

  // Track any in-flight dashboard fetch so the Refresh button shows progress
  const fetchingCount = useIsFetching({
    predicate: (q) => q.queryKey[0] === 'dashboard',
  });

  const refresh = () => {
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'dashboard',
    });
  };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <div className="dash-subtitle">Operations Overview</div>
        </div>
        <button
          type="button"
          className="dash-refresh"
          onClick={refresh}
          disabled={fetchingCount > 0}
          aria-label="Refresh dashboard data"
        >
          <span className="dash-refresh-icon" aria-hidden="true">↻</span>
          {fetchingCount > 0 ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── KPI row ─────────────────────────────────────────────── */}
      <KpiRow query={kpisQ} />

      {/* ── Two-column content ──────────────────────────────────── */}
      <div className="dashboard-content">
        <ActivityPanel query={activityQ} />
        <StuckPanel query={stuckQ} />
      </div>
    </div>
  );
}

/* ─── KPI row ─────────────────────────────────────────────────────────── */
function KpiRow({ query }) {
  const { data, isLoading, isError, error, refetch } = query;

  if (isLoading) {
    return (
      <div className="dashboard-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="kpi-card" aria-busy="true">
            <div className="kpi-label">Loading…</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flex: 1 }}>
              <LoadingSpinner size={22} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ marginBottom: 24 }}>
        <ErrorState
          title="Could not load KPIs"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      </div>
    );
  }

  const kpi = data || {};
  const credIssued = kpi.credentialsIssued || {};
  const stuckCount = Number(kpi.stuckIssuesCount) || 0;
  const stuckHealthy = stuckCount === 0;

  return (
    <div className="dashboard-grid">
      <KpiCard
        label="Credentials Issued"
        value={formatNumber(credIssued.total)}
        sub={
          <>
            <span className="kpi-sub-strong">+{formatNumber(credIssued.thisWeek) || 0}</span> this week
          </>
        }
      />
      <KpiCard
        label="Active Candidates"
        value={formatNumber(kpi.activeCandidates)}
        sub="Registered + assessed"
      />
      <KpiCard
        label="Avg Score"
        value={kpi.avgScore != null ? `${kpi.avgScore}%` : '—'}
        sub="Across completed assessments"
      />
      <KpiCard
        label="Stuck Issues"
        value={formatNumber(stuckCount)}
        sub={stuckHealthy ? 'All systems healthy' : 'Require operator attention'}
        tone={stuckHealthy ? 'ok' : 'warn'}
      />
    </div>
  );
}

function KpiCard({ label, value, sub, tone }) {
  const cardClass =
    'kpi-card' +
    (tone === 'warn' ? ' kpi-card-warn' : '') +
    (tone === 'ok' ? ' kpi-card-ok' : '');
  const numClass =
    'kpi-number' +
    (tone === 'warn' ? ' kpi-number-warn' : '') +
    (tone === 'ok' ? ' kpi-number-ok' : '');
  return (
    <div className={cardClass}>
      <div className="kpi-label">{label}</div>
      <div className={numClass}>{value ?? '—'}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function formatNumber(n) {
  if (n == null) return null;
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return num.toLocaleString();
}

/* ─── Activity panel ──────────────────────────────────────────────────── */
function ActivityPanel({ query }) {
  const { data, isLoading, isError, error, refetch } = query;
  const rows = data?.data || [];

  return (
    <section className="dash-panel" aria-label="Recent activity">
      <header className="dash-panel-head">
        <div className="dash-panel-title">Recent Activity</div>
        <div className="dash-panel-meta">
          {data?.total != null ? `${data.total} total` : 'Last events'}
        </div>
      </header>

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '36px 0' }}>
          <LoadingSpinner label="Loading activity" />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Could not load activity"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="activity-empty">No activity yet</div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className="activity-list">
          {rows.map((row) => (
            <ActivityRow key={row.id ?? `${row.createdAt}-${row.action}`} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityRow({ row }) {
  const tone = actionTone(row.action);
  const actionClass =
    'activity-action' +
    (tone === 'destructive'
      ? ' activity-action-destructive'
      : tone === 'neutral'
      ? ' activity-action-neutral'
      : ' activity-action-view');

  const adminHandle = (row.adminEmail || '').split('@')[0] || 'system';
  const targetLabel = humanizeTargetType(row.targetType);

  return (
    <div className="activity-row">
      <span className="activity-time" title={row.createdAt}>
        {timeAgo(row.createdAt)}
      </span>
      <span className="activity-main">
        <span className={actionClass}>{humanizeAction(row.action)}</span>
        {(targetLabel || row.targetId) && (
          <span className="activity-target">
            {targetLabel}
            {row.targetId && (
              <>
                {targetLabel ? ': ' : ''}
                <span className="activity-target-id">{row.targetId}</span>
              </>
            )}
          </span>
        )}
      </span>
      <span className="activity-admin">by {adminHandle}</span>
    </div>
  );
}

/* ─── Stuck snapshot ──────────────────────────────────────────────────── */
function StuckPanel({ query }) {
  const { data, isLoading, isError, error, refetch } = query;
  const total = Number(data?.total) || 0;
  const byType = data?.byType || {};

  return (
    <aside className="dash-panel" aria-label="Stuck issues snapshot">
      <header className="dash-panel-head">
        <div className="dash-panel-title">
          Stuck Issues{' '}
          {!isLoading && !isError && (
            <span style={{ color: 'var(--muted)', fontSize: 16 }}>({total})</span>
          )}
        </div>
      </header>

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <LoadingSpinner />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Could not load stuck issues"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && total === 0 && (
        <div className="stuck-healthy">✓ All systems healthy</div>
      )}

      {!isLoading && !isError && total > 0 && (
        <>
          <div className="stuck-list">
            {Object.entries(byType).map(([key, count]) => {
              const cfg = stuckTypeConfig(key);
              const c = Number(count) || 0;
              const label = c === 1 ? cfg.singular : cfg.plural;
              const dotClass =
                'stuck-dot ' +
                (cfg.tone === 'red'
                  ? 'stuck-dot-red'
                  : cfg.tone === 'amber'
                  ? 'stuck-dot-amber'
                  : 'stuck-dot-muted');
              return (
                <div className="stuck-row" key={key}>
                  <span className={dotClass} aria-hidden="true" />
                  <span className="stuck-label">{label}</span>
                  <span className="stuck-count">{c.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
          <Link to="/stuck-issues" className="stuck-link">
            View all →
          </Link>
        </>
      )}

      {!isLoading && !isError && <StuckNotes notes={data?.notes} />}
    </aside>
  );
}

// Notes can be a string or a {key: string} map (e.g., per-type explanations
// like { emailBounce: "expected: 0", undeliveredCredential: "expected: 0" }).
// Render either shape; ignore anything else.
function StuckNotes({ notes }) {
  if (!notes) return null;

  const wrap = {
    marginTop: 14,
    padding: '10px 12px',
    background: 'var(--faint)',
    borderLeft: '2px solid var(--border)',
    fontSize: 12,
    color: 'var(--muted)',
    lineHeight: 1.5,
  };

  if (typeof notes === 'string') {
    return <div style={wrap}>{notes}</div>;
  }

  if (typeof notes === 'object' && !Array.isArray(notes)) {
    const entries = Object.entries(notes).filter(([, v]) =>
      typeof v === 'string' || typeof v === 'number',
    );
    if (entries.length === 0) return null;
    return (
      <div style={wrap}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ marginBottom: 2 }}>
            <span style={{ color: 'var(--white)' }}>{humanizeNoteKey(k)}:</span> {String(v)}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function humanizeNoteKey(k) {
  // camelCase → spaced + capitalized
  const spaced = String(k).replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
