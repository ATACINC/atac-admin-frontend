import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGetCredentials } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import { timeAgo } from '../utils/timeAgo';
import './CredentialsListPage.css';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const STATUS_OPTIONS = ['all', 'active', 'revoked', 'expired'];

export default function CredentialsListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL state (canonical) ─────────────────────────────────────
  const status = searchParams.get('status') || 'all';
  const searchUrl = searchParams.get('search') || '';
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

  // ── Local input state for snappy typing; debounced into URL ──
  const [searchInput, setSearchInput] = useState(searchUrl);

  // Re-sync local input if URL changes from elsewhere (e.g., Clear filters, back button)
  useEffect(() => {
    setSearchInput(searchUrl);
  }, [searchUrl]);

  // Push debounced search into URL (resets offset to 0 on change)
  useEffect(() => {
    if (searchInput === searchUrl) return;
    const t = setTimeout(() => {
      updateParams({ search: searchInput || null, offset: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // ── URL param helper. null/undefined/'' deletes; otherwise sets. ──
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
    // Scroll to top of main content for long lists
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const hasFilters = status !== 'all' || !!searchUrl;

  // ── Query ────────────────────────────────────────────────────
  const queryParams = {
    limit: PAGE_SIZE,
    offset,
    ...(status !== 'all' && { status }),
    ...(searchUrl && { search: searchUrl }),
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['credentials', queryParams],
    queryFn: () => apiGetCredentials(queryParams),
    placeholderData: (prev) => prev, // stale-while-revalidate
  });

  const rows = data?.data || [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  // Active row highlight when navigating back from detail page.
  // Detail page should pass: navigate('/credentials', { state: { activeCredentialId: ... } })
  const activeId = location.state?.activeCredentialId || null;

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="creds-header">
        <div>
          <h1 className="creds-title">Credentials</h1>
          <div className="creds-subtitle">
            {isLoading ? 'Loading…' : `${total.toLocaleString()} total`}
          </div>
        </div>
      </header>

      {/* ── Filters ────────────────────────────────────────── */}
      <div className="creds-filters">
        <input
          type="search"
          className="creds-search"
          placeholder="Search by name, email, or credential ID"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search credentials"
        />
        <select
          className="creds-select"
          value={status}
          onChange={onStatusChange}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button type="button" className="creds-clear" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
        {isFetching && !isLoading && (
          <span className="creds-fetching" aria-live="polite">
            Refreshing…
          </span>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      {isError ? (
        <ErrorState
          title="Could not load credentials"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      ) : isLoading ? (
        <div className="creds-state">
          <LoadingSpinner label="Loading credentials" />
        </div>
      ) : rows.length === 0 ? (
        <div className="creds-state">
          <div>No credentials match your filters.</div>
          {hasFilters && (
            <button type="button" className="creds-empty-action" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={'creds-table-wrap' + (isFetching && !isLoading ? ' is-stale' : '')}>
            <table className="creds-table">
              <thead>
                <tr>
                  <th>Credential ID</th>
                  <th>Candidate</th>
                  <th>Program</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <CredentialRow
                    key={row.credentialId}
                    row={row}
                    isActive={row.credentialId === activeId}
                    onNavigate={(id) => navigate(`/credentials/${id}`)}
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
    </div>
  );
}

function CredentialRow({ row, isActive, onNavigate }) {
  // Backend returns a derived status string already ('active'|'valid'|'revoked'|'expired').
  const effectiveStatus = row.status || 'active';

  // Click anywhere on the row navigates. Inner Link/button absorb their own clicks.
  const handleRowClick = () => onNavigate(row.credentialId);
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNavigate(row.credentialId);
    }
  };
  // Stop row navigation when clicking the inner ID link or View button —
  // they navigate themselves and we don't want a duplicate transition.
  const stopRow = (e) => e.stopPropagation();

  return (
    <tr
      className={isActive ? 'is-active' : undefined}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View credential ${row.credentialId}`}
    >
      <td>
        <Link
          to={`/credentials/${row.credentialId}`}
          className="cred-id"
          onClick={stopRow}
        >
          {row.credentialId}
        </Link>
      </td>
      <td>
        <div className="cand-name">{row.name || '—'}</div>
        {row.email && <div className="cand-email">{row.email}</div>}
      </td>
      <td>
        <span className="cred-program">{row.program || '—'}</span>
      </td>
      <td>
        <span className="cred-score">
          {row.percentage != null ? `${row.percentage}%` : '—'}
        </span>
      </td>
      <td>
        <StatusBadge status={effectiveStatus} />
      </td>
      <td>
        <span className="cred-issued" title={row.issuedAt}>
          {row.issuedAt ? timeAgo(row.issuedAt) : '—'}
        </span>
      </td>
      <td className="cred-actions">
        <Link to={`/credentials/${row.credentialId}`} onClick={stopRow}>
          View
        </Link>
      </td>
    </tr>
  );
}
