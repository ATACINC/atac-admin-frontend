import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGetFeedbackList, apiGetFeedbackStats } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import FeedbackDetailModal from '../components/FeedbackDetailModal';
import { formatLongDate } from '../utils/format';

const PAGE_SIZE = 50;
const PREVIEW_MAX = 80;

const SOURCE_FILTERS = [
  { value: 'all',     label: 'All sources' },
  { value: 'pioneer', label: 'Pioneer' },
  { value: 'public',  label: 'Public' },
];

const RECOMMEND_FILTERS = [
  { value: 'all',   label: 'All responses' },
  { value: 'true',  label: 'Would recommend' },
  { value: 'false', label: 'Would NOT recommend' },
];

export default function FeedbackPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const source = searchParams.get('source') || 'all';
  const wouldRecommend = searchParams.get('wouldRecommend') || 'all';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [selectedRow, setSelectedRow] = useState(null);

  // ── List query ────────────────────────────────────────────────
  const listQuery = useQuery({
    queryKey: ['feedback', 'list', { source, wouldRecommend, page }],
    queryFn: () => apiGetFeedbackList({ source, wouldRecommend, limit: PAGE_SIZE, offset }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // ── Stats query (independent of filters) ─────────────────────
  const statsQuery = useQuery({
    queryKey: ['feedback', 'stats'],
    queryFn: apiGetFeedbackStats,
    staleTime: 30_000,
  });

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all' || !value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete('page'); // reset to page 1 on filter change
    setSearchParams(next);
  };

  const setPage = (newPage) => {
    const next = new URLSearchParams(searchParams);
    if (newPage <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(newPage));
    }
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const items = listQuery.data?.items || [];
  const total = listQuery.data?.total ?? 0;
  const hasFilters = source !== 'all' || wouldRecommend !== 'all';

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Feedback</h1>
          <div style={subtitleStyle}>
            {listQuery.isLoading
              ? 'Loading...'
              : `${total.toLocaleString()} total${hasFilters ? ' (filtered)' : ''}`}
          </div>
        </div>
      </header>

      {/* ── Stats strip ─────────────────────────────────────── */}
      <StatsStrip query={statsQuery} />

      {/* ── Filter bar ──────────────────────────────────────── */}
      <div style={filterBarStyle}>
        <select
          style={selectStyle}
          value={source}
          onChange={(e) => updateFilter('source', e.target.value)}
          aria-label="Filter by source"
        >
          {SOURCE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          style={selectStyle}
          value={wouldRecommend}
          onChange={(e) => updateFilter('wouldRecommend', e.target.value)}
          aria-label="Filter by recommendation"
        >
          {RECOMMEND_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            style={clearButtonStyle}
            onClick={() => setSearchParams(new URLSearchParams())}
          >
            Clear Filters
          </button>
        )}
        {listQuery.isFetching && !listQuery.isLoading && (
          <span style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Refreshing...
          </span>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      {listQuery.isError ? (
        <ErrorState
          title="Could not load feedback"
          message={listQuery.error?.response?.data?.error || listQuery.error?.message || 'Unknown error.'}
          onRetry={listQuery.refetch}
        />
      ) : listQuery.isLoading ? (
        <div style={stateContainerStyle}>
          <LoadingSpinner label="Loading feedback" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onClear={() => setSearchParams(new URLSearchParams())} />
      ) : (
        <>
          <div
            style={{
              ...tableWrapStyle,
              opacity: listQuery.isFetching && !listQuery.isLoading ? 0.55 : 1,
              pointerEvents: listQuery.isFetching && !listQuery.isLoading ? 'none' : 'auto',
              transition: 'opacity 0.15s',
            }}
          >
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Submitted</Th>
                  <Th>Candidate</Th>
                  <Th>Email</Th>
                  <Th>Score</Th>
                  <Th align="center">Diff</Th>
                  <Th align="center">Clar</Th>
                  <Th align="center">Time</Th>
                  <Th align="center">Fair</Th>
                  <Th align="center">Recommend</Th>
                  <Th>Source</Th>
                  <Th>Preview</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <FeedbackRow key={row.id || row.assessment_id} row={row} onOpen={setSelectedRow} />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={setPage}
          />
        </>
      )}

      {selectedRow && (
        <FeedbackDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}

/* ── Stats strip ─────────────────────────────────────────────────── */

function StatsStrip({ query }) {
  if (query.isError) {
    return (
      <div style={{ marginBottom: 18 }}>
        <ErrorState
          title="Could not load stats"
          message={query.error?.response?.data?.error || query.error?.message || 'Unknown error.'}
          onRetry={query.refetch}
        />
      </div>
    );
  }

  const data = query.data;
  const loading = query.isLoading;
  const isEmpty = !loading && data && data.total_count === 0;

  const formatRating = (n) => {
    if (loading) return '...';
    if (n == null || isEmpty) return formatLongDate(null); // reuses the existing missing-value placeholder convention from utils/format.js
    return `${Number(n).toFixed(1)} / 5`;
  };

  const formatPct = (n) => {
    if (loading) return '...';
    if (n == null || isEmpty) return formatLongDate(null);
    return `${Math.round(Number(n))}%`;
  };

  const formatCount = (n) => {
    if (loading) return '...';
    return Number(n || 0).toLocaleString();
  };

  return (
    <div style={statsStripStyle}>
      <Tile label="Total responses" value={formatCount(data?.total_count)} />
      <Tile label="Avg fairness" value={formatRating(data?.avg_fairness)} />
      <Tile label="Avg clarity" value={formatRating(data?.avg_clarity)} />
      <Tile label="Would recommend" value={formatPct(data?.would_recommend_pct)} accent />
    </div>
  );
}

function Tile({ label, value, accent }) {
  return (
    <div style={tileStyle}>
      <div style={tileLabelStyle}>{label}</div>
      <div style={{ ...tileValueStyle, color: accent ? 'var(--gold)' : 'var(--white)' }}>
        {value}
      </div>
    </div>
  );
}

/* ── Table row + sub-components ─────────────────────────────────── */

function FeedbackRow({ row, onOpen }) {
  const handleClick = () => onOpen(row);
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(row);
    }
  };

  const previewSource = row.free_text || row.ui_friction_notes || '';
  const preview = previewSource
    ? previewSource.length > PREVIEW_MAX
      ? `${previewSource.slice(0, PREVIEW_MAX).trim()}...`
      : previewSource
    : '';

  return (
    <tr
      onClick={handleClick}
      onKeyDown={handleKey}
      tabIndex={0}
      role="button"
      aria-label={`Open feedback from ${row.candidate_name || row.candidate_email || 'candidate'}`}
      style={rowStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <Td>{row.submitted_at ? formatLongDate(row.submitted_at) : formatLongDate(null)}</Td>
      <Td>{row.candidate_name || formatLongDate(null)}</Td>
      <Td muted>{row.candidate_email || formatLongDate(null)}</Td>
      <Td>{row.score != null ? `${row.score}%` : formatLongDate(null)}</Td>
      <Td align="center">{row.difficulty_rating != null ? `${row.difficulty_rating}/5` : formatLongDate(null)}</Td>
      <Td align="center">{row.clarity_rating != null ? `${row.clarity_rating}/5` : formatLongDate(null)}</Td>
      <Td align="center">{row.time_pressure_rating != null ? `${row.time_pressure_rating}/5` : formatLongDate(null)}</Td>
      <Td align="center">{row.fairness_rating != null ? `${row.fairness_rating}/5` : formatLongDate(null)}</Td>
      <Td align="center"><RecommendBadge value={row.would_recommend} /></Td>
      <Td muted>{(row.source || '').toLowerCase()}</Td>
      <Td muted>{preview || formatLongDate(null)}</Td>
    </tr>
  );
}

function RecommendBadge({ value }) {
  if (value === true) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 700,
        background: 'rgba(34, 166, 126, 0.10)',
        color: 'var(--teal-2)',
        border: '1px solid var(--teal-2)',
      }}>Yes</span>
    );
  }
  if (value === false) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 700,
        background: 'rgba(196, 92, 92, 0.10)',
        color: 'var(--red)',
        border: '1px solid var(--red)',
      }}>No</span>
    );
  }
  return <span style={{ color: 'var(--muted)' }}>{formatLongDate(null)}</span>;
}

function Th({ children, align = 'left' }) {
  return (
    <th
      style={{
        background: 'var(--bg-3)',
        color: 'var(--muted)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        textAlign: align,
        padding: '12px 14px',
        borderBottom: '1px solid var(--border-2)',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-body)',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, muted, align = 'left' }) {
  return (
    <td
      style={{
        padding: '12px 14px',
        verticalAlign: 'middle',
        color: muted ? 'var(--muted)' : 'var(--white)',
        fontSize: 13,
        textAlign: align,
        fontFamily: 'var(--font-body)',
        whiteSpace: muted && children && String(children).length > 40 ? 'normal' : 'nowrap',
        maxWidth: muted ? 280 : 'none',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {children}
    </td>
  );
}

/* ── Empty state ────────────────────────────────────────────────── */

function EmptyState({ hasFilters, onClear }) {
  return (
    <div style={{ ...stateContainerStyle, padding: '80px 24px' }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          color: 'var(--white)',
          marginBottom: 12,
          lineHeight: 1.2,
        }}
      >
        {hasFilters ? 'No feedback matches your filters.' : 'No feedback submissions yet.'}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: 'var(--muted)',
          lineHeight: 1.6,
          maxWidth: 520,
          margin: '0 auto',
        }}
      >
        {hasFilters
          ? 'Adjust or clear the filters above to see other responses.'
          : 'Once candidates begin submitting feedback after completing their assessment, their responses will appear here.'}
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          style={{ ...clearButtonStyle, marginTop: 18 }}
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */

const headerStyle = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 18,
};

const titleStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: 36,
  fontWeight: 300,
  color: 'var(--white)',
  margin: '0 0 4px',
  lineHeight: 1.05,
};

const subtitleStyle = {
  fontSize: 12,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  fontFamily: 'var(--font-body)',
};

const statsStripStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 16,
  marginBottom: 18,
};

const tileStyle = {
  background: 'var(--bg-1)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '18px 20px',
};

const tileLabelStyle = {
  fontSize: 10,
  color: 'var(--muted)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  fontWeight: 600,
  marginBottom: 10,
  fontFamily: 'var(--font-body)',
};

const tileValueStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: 28,
  fontWeight: 400,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
};

const filterBarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 0 14px',
  marginBottom: 6,
  borderBottom: '1px solid var(--border-2)',
  flexWrap: 'wrap',
};

const selectStyle = {
  background: 'rgba(8, 11, 18, 0.6)',
  border: '1px solid var(--border-2)',
  borderRadius: 3,
  color: 'var(--white)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  padding: '9px 14px',
  outline: 'none',
  cursor: 'pointer',
  minWidth: 200,
};

const clearButtonStyle = {
  background: 'transparent',
  color: 'var(--gold)',
  border: '1px solid var(--border)',
  borderRadius: 2,
  padding: '9px 14px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--font-body)',
};

const stateContainerStyle = {
  padding: '60px 20px',
  textAlign: 'center',
  color: 'var(--muted)',
  fontSize: 15,
};

const tableWrapStyle = {
  background: 'transparent',
  border: '1px solid var(--border-2)',
  borderRadius: 4,
  overflow: 'hidden',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const rowStyle = {
  borderBottom: '1px solid var(--border-2)',
  cursor: 'pointer',
  transition: 'background 0.12s',
};
