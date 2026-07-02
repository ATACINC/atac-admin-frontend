import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { apiGetFunnel } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import './FunnelPage.css';

/**
 * Read-only funnel + attribution view, backed by GET /api/admin/funnel.
 *
 * The endpoint's only server-side filter is `since` (a start date), so the
 * date-range control maps to preset windows that resolve to `since`. The
 * `process` dimension exists only on the clicks/attribution rows, so the
 * process control filters that table client-side — the top-line funnel and
 * recovery figures are account-wide for the window (the endpoint does not
 * segment them by process). No writes, no mutations.
 */

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

function rangeToSince(range) {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : null;
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const nf = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString());
const pf = (p) => (p == null || Number.isNaN(Number(p)) ? '—' : `${p}%`);
const moneyFromCents = (cents, currency = 'USD') => {
  const amount = Number(cents) / 100;
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};
const titleCase = (s) =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export default function FunnelPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const range = RANGES.some((r) => r.value === searchParams.get('range'))
    ? searchParams.get('range')
    : 'all';
  const process = searchParams.get('process') || 'all';

  // Resolve the preset to a concrete `since` ONLY when the range changes.
  // Computing it inline would call new Date() every render, producing a new
  // ISO string (and thus a new query key) each time -> infinite refetch loop.
  const since = useMemo(() => rangeToSince(range), [range]);

  const updateParams = (updates) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v == null || v === '' || v === 'all') next.delete(k);
      else next.set(k, String(v));
    });
    setSearchParams(next);
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['funnel', { since }],
    queryFn: () => apiGetFunnel({ since }),
    placeholderData: (prev) => prev,
  });

  const fetchingCount = useIsFetching({ predicate: (q) => q.queryKey[0] === 'funnel' });
  const refresh = () =>
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'funnel' });

  // ── Derived, memoized off the raw response ─────────────────────────────
  const derived = useMemo(() => {
    if (!data) return null;
    const funnel = data.funnel || {};
    const recovery = data.recovery || {};
    const byChannelTouch = recovery.by_channel_touch || [];
    const people = recovery.people || {};
    const clicks = data.clicks || [];
    const clickConversions = data.click_conversions || [];
    const welcome = data.welcome_sms || {};

    // Account funnel: a true subset chain straight from funnel{} — each stage
    // is a subset of the one before, so bars read cleanly as % of Registered.
    const accountStages = [
      { key: 'registered', label: 'Registered', value: Number(funnel.registered) || 0, tone: 'gold' },
      { key: 'email_verified', label: 'Email verified', value: Number(funnel.email_verified) || 0, tone: 'gold' },
      { key: 'paid', label: 'Paid', value: Number(funnel.paid) || 0, tone: 'teal' },
      { key: 'assessment_passed', label: 'Assessment passed', value: Number(funnel.assessment_passed) || 0, tone: 'teal' },
      { key: 'certified', label: 'Certified', value: Number(funnel.certified) || 0, tone: 'teal' },
    ];

    // Recovery funnel: messaging → clicks → recovered payment, kept separate so
    // it is internally consistent (never mixed with account totals).
    const sentTotal = byChannelTouch.reduce((s, r) => s + (Number(r.sent) || 0), 0);
    const clickedTotal = clicks.reduce((s, r) => s + (Number(r.clicks) || 0), 0);
    const recoveredCount = Number(people.converted) || 0;
    const recoveryStages = [
      { key: 'sent', label: 'Sent', value: sentTotal, tone: 'gold' },
      { key: 'clicked', label: 'Clicked', value: clickedTotal, tone: 'gold' },
      { key: 'recovered', label: 'Recovered', value: recoveredCount, tone: 'teal' },
    ];

    // Recovered revenue in dollars (backend now returns it on recovery.people).
    // unmapped > 0 means some conversions could not be resolved to an exact
    // charge, so the figure is a floor (rendered with a "≥" prefix).
    const cents = Number(people.recovered_revenue_cents);
    const revenueCents = Number.isFinite(cents) ? cents : null;
    const currency = people.currency || 'USD';
    const unmapped = Number(people?.revenue_source?.unmapped) || 0;

    // Merge click_conversions (identified-click -> payment join) onto clicks.
    const convByKey = new Map();
    clickConversions.forEach((r) =>
      convByKey.set(`${r.process}|${r.sequence}|${r.touch}|${r.channel}`, r),
    );
    const attribution = clicks.map((r) => {
      const conv = convByKey.get(`${r.process}|${r.sequence}|${r.touch}|${r.channel}`);
      return {
        ...r,
        clickers: conv?.clickers ?? null,
        converted: conv?.converted ?? null,
        conversion_pct: conv?.conversion_pct ?? null,
      };
    });

    const processes = Array.from(new Set(clicks.map((r) => r.process).filter(Boolean))).sort();

    return {
      funnel,
      byChannelTouch,
      people,
      accountStages,
      recoveryStages,
      attribution,
      processes,
      welcome,
      recovered: recoveredCount,
      reached: Number(people.reached) || 0,
      recoveredPct: people.conversion_pct ?? null,
      revenueCents,
      currency,
      unmapped,
    };
  }, [data]);

  const attributionRows = useMemo(() => {
    if (!derived) return [];
    if (process === 'all') return derived.attribution;
    return derived.attribution.filter((r) => r.process === process);
  }, [derived, process]);

  // ── Header (always visible) ────────────────────────────────────────────
  const windowLabel = RANGES.find((r) => r.value === range)?.label || 'All time';
  const generatedAt = data?.generated_at ? new Date(data.generated_at).toLocaleString() : null;

  return (
    <div>
      <header className="funnel-header">
        <div>
          <h1 className="funnel-title">Funnel</h1>
          <div className="funnel-subtitle">
            {windowLabel}
            {generatedAt && ` · as of ${generatedAt}`}
            {fetchingCount > 0 && <span className="funnel-fetching"> · refreshing…</span>}
          </div>
        </div>
        <button
          type="button"
          className="funnel-refresh"
          onClick={refresh}
          disabled={fetchingCount > 0}
          aria-label="Refresh funnel data"
        >
          <span aria-hidden="true">↻</span>
          {fetchingCount > 0 ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="funnel-controls">
        <div className="funnel-filter">
          <span className="funnel-filter-label">Date range</span>
          <select
            className="funnel-select"
            value={range}
            onChange={(e) => updateParams({ range: e.target.value })}
            aria-label="Filter by date range"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="funnel-filter">
          <span className="funnel-filter-label">Process</span>
          <select
            className="funnel-select"
            value={process}
            onChange={(e) => updateParams({ process: e.target.value })}
            aria-label="Filter attribution by process"
            disabled={!derived || derived.processes.length === 0}
          >
            <option value="all">All processes</option>
            {derived?.processes.map((p) => (
              <option key={p} value={p}>
                {titleCase(p)}
              </option>
            ))}
          </select>
          <span className="funnel-filter-hint">applies to the attribution table</span>
        </div>
      </div>

      {/* ── Loading / error ─────────────────────────────────────────────── */}
      {isLoading && (
        <div className="funnel-state">
          <LoadingSpinner label="Loading funnel" />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Could not load funnel report"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && derived && (
        <div className={fetchingCount > 0 ? 'is-stale' : undefined}>
          {/* ── KPI cards ─────────────────────────────────────────────── */}
          <div className="funnel-kpis">
            <KpiCard label="Sent" value={nf(derived.recoveryStages[0].value)} sub="Recovery messages" />
            <KpiCard label="Clicked" value={nf(derived.recoveryStages[1].value)} sub="Message link clicks" />
            <KpiCard label="Paid" value={nf(derived.funnel.paid)} sub="Payment verified" tone="teal" />
            <KpiCard label="Certified" value={nf(derived.funnel.certified)} sub="Active credential" tone="teal" />
            <KpiCard
              label="Recovered"
              value={
                derived.revenueCents != null
                  ? `${derived.unmapped > 0 ? '≥' : ''}${moneyFromCents(derived.revenueCents, derived.currency)}`
                  : nf(derived.recovered)
              }
              sub={`${nf(derived.recovered)} recovered · ${pf(derived.recoveredPct)} of ${nf(
                derived.reached,
              )} reached`}
              tone="gold"
            />
          </div>

          {/* ── Account funnel (true subset chain; bars as % of Registered) ── */}
          <section className="funnel-section">
            <div className="funnel-section-head">
              <div className="funnel-section-title">Account Funnel</div>
              <div className="funnel-section-meta">
                Registered → Email verified → Paid → Assessment passed → Certified
              </div>
            </div>
            <FunnelBars stages={derived.accountStages} pctOfLabel="registered" />
          </section>

          {/* ── Recovery funnel (messaging → click → recovered payment) ──── */}
          <section className="funnel-section">
            <div className="funnel-section-head">
              <div className="funnel-section-title">Recovery Funnel</div>
              <div className="funnel-section-meta">Sent → Clicked → Recovered</div>
            </div>
            <FunnelBars stages={derived.recoveryStages} pctOfLabel="sent" />
            <div className="funnel-note">
              Sent and Clicked are recovery message and click counts; Recovered is people who paid
              after a send.
            </div>
          </section>

          {/* ── Recovery by channel / touch ───────────────────────────── */}
          <section className="funnel-section">
            <div className="funnel-section-head">
              <div className="funnel-section-title">Recovered Payments</div>
              <div className="funnel-section-meta">
                {nf(derived.recovered)} recovered · {pf(derived.recoveredPct)} of {nf(derived.reached)}{' '}
                reached
              </div>
            </div>
            <div className="funnel-table-wrap">
              <table className="funnel-table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Touch</th>
                    <th className="num">Sent</th>
                    <th className="num">Converted</th>
                    <th className="num">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.byChannelTouch.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="funnel-empty">
                        No recovery sends in this window.
                      </td>
                    </tr>
                  ) : (
                    derived.byChannelTouch.map((r, i) => (
                      <tr key={`${r.channel}-${r.touch}-${i}`}>
                        <td>{titleCase(r.channel)}</td>
                        <td>{titleCase(r.touch)}</td>
                        <td className="num">{nf(r.sent)}</td>
                        <td className="num">{nf(r.converted)}</td>
                        <td className="num funnel-strong">{pf(r.conversion_pct)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="funnel-note">
              Rows show recovered <em>payment conversions</em> (a send counts as converted when the
              candidate paid after it was sent); the total recovered revenue is in the Recovered KPI
              above.
            </div>
          </section>

          {/* ── Attribution / clicks (process-filterable) ─────────────── */}
          <section className="funnel-section">
            <div className="funnel-section-head">
              <div className="funnel-section-title">Attribution by Click</div>
              <div className="funnel-section-meta">
                {process === 'all' ? 'All processes' : titleCase(process)} ·{' '}
                {attributionRows.length} {attributionRows.length === 1 ? 'row' : 'rows'}
              </div>
            </div>
            <div className="funnel-table-wrap">
              <table className="funnel-table">
                <thead>
                  <tr>
                    <th>Process</th>
                    <th>Seq</th>
                    <th>Touch</th>
                    <th>Channel</th>
                    <th className="num">Clicks</th>
                    <th className="num">Identified</th>
                    <th className="num">Converted</th>
                    <th className="num">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {attributionRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="funnel-empty">
                        {derived.attribution.length === 0
                          ? 'No link clicks recorded in this window.'
                          : 'No clicks for this process.'}
                      </td>
                    </tr>
                  ) : (
                    attributionRows.map((r, i) => (
                      <tr key={`${r.process}-${r.sequence}-${r.touch}-${r.channel}-${i}`}>
                        <td>{titleCase(r.process)}</td>
                        <td className="num">{r.sequence ?? '—'}</td>
                        <td>{titleCase(r.touch)}</td>
                        <td>{titleCase(r.channel)}</td>
                        <td className="num">{nf(r.clicks)}</td>
                        <td className="num">{nf(r.identified)}</td>
                        <td className="num">{r.converted == null ? '—' : nf(r.converted)}</td>
                        <td className="num funnel-strong">{pf(r.conversion_pct)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="funnel-note">
              Clicks are anonymous until links carry a candidate id, so Converted / Conversion are
              blank for unidentified rows.
            </div>
          </section>

          {/* ── Welcome-SMS ledger ────────────────────────────────────── */}
          {Object.keys(derived.welcome).length > 0 && (
            <section className="funnel-section">
              <div className="funnel-section-head">
                <div className="funnel-section-title">Welcome SMS Ledger</div>
              </div>
              <div className="funnel-chips">
                {Object.entries(derived.welcome).map(([status, n]) => (
                  <div className="funnel-chip" key={status}>
                    <span className="funnel-chip-label">{titleCase(status)}</span>
                    <span className="funnel-chip-count">{nf(n)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, tone }) {
  const numClass = 'funnel-kpi-number' + (tone === 'teal' ? ' is-teal' : '');
  return (
    <div className="funnel-kpi-card">
      <div className="funnel-kpi-label">{label}</div>
      <div className={numClass}>{value}</div>
      <div className="funnel-kpi-sub">{sub}</div>
    </div>
  );
}

// Renders one internally-consistent funnel. Each stage is a subset of the
// first, so the bar width and the annotation are both value / firstStage.
function FunnelBars({ stages, pctOfLabel }) {
  const denom = Math.max(1, stages[0]?.value || 0);
  return (
    <div className="funnel-bars">
      {stages.map((s, i) => {
        const width = Math.max(0, Math.min(100, Math.round((s.value / denom) * 100)));
        const pct = Math.round((s.value / denom) * 1000) / 10;
        return (
          <div className="funnel-bar-row" key={s.key}>
            <div className="funnel-bar-label">{s.label}</div>
            <div className="funnel-bar-track">
              <div
                className={'funnel-bar-fill funnel-bar-fill-' + s.tone}
                style={{ width: `${width}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="funnel-bar-value">
              <span className="funnel-bar-count">{nf(s.value)}</span>
              {i !== 0 && (
                <span className="funnel-bar-pct">
                  {pct}% of {pctOfLabel}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
