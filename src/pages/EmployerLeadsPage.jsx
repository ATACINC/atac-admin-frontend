import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGetEmployerLeads } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import Toast from '../components/Toast';
import MarkContactedModal from '../components/MarkContactedModal';
import { timeAgo } from '../utils/timeAgo';
import './EmployerLeadsPage.css';

const PAGE_SIZE = 25;

// Single-fetch limit. Today's data is 9 leads — well under this. We fetch
// everything in one shot so pill counts and sorts can be computed client-side
// (backend doesn't expose count-by-contacted-status, and server-side
// pagination would only sort the visible page which is misleading for
// "pending priority"). Switch to 3 parallel count-queries + server-side
// filter when total leads approach this ceiling.
const FETCH_ALL_LIMIT = 500;

const SORT_OPTIONS = [
  { value: 'newest',   label: 'Newest first' },
  { value: 'oldest',   label: 'Oldest first' },
  { value: 'pending',  label: 'Pending priority' },
];

const FILTER_OPTIONS = ['all', 'pending', 'contacted'];

export default function EmployerLeadsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL state ────────────────────────────────────────────────
  const filter = FILTER_OPTIONS.includes(searchParams.get('filter'))
    ? searchParams.get('filter')
    : 'all';
  const sort = SORT_OPTIONS.find((o) => o.value === searchParams.get('sort'))
    ? searchParams.get('sort')
    : 'newest';
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

  const updateParams = (updates) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '' || v === 'all' || v === 'newest') {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    });
    setSearchParams(next);
  };

  // ── Modal + toast state ──────────────────────────────────────
  const [modalLead, setModalLead] = useState(null); // { id, employerName, contactEmail }
  const [toast, setToast] = useState(null);

  // ── Data fetch (everything at once — see FETCH_ALL_LIMIT note) ──
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['employerLeads'],
    queryFn: () => apiGetEmployerLeads({ limit: FETCH_ALL_LIMIT, offset: 0 }),
    placeholderData: (prev) => prev,
  });

  const allLeads = data?.data || [];
  const apiTotal = data?.total ?? allLeads.length;

  // ── Derived counts (always accurate, computed client-side) ──
  const counts = useMemo(() => {
    const pending = allLeads.filter((l) => !l.contactedAt).length;
    const contacted = allLeads.length - pending;
    return { all: allLeads.length, pending, contacted };
  }, [allLeads]);

  // ── Filter ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filter === 'pending') return allLeads.filter((l) => !l.contactedAt);
    if (filter === 'contacted') return allLeads.filter((l) => !!l.contactedAt);
    return allLeads;
  }, [allLeads, filter]);

  // ── Sort ────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const ts = (l) => new Date(l.createdAt).getTime() || 0;
    if (sort === 'oldest') return [...filtered].sort((a, b) => ts(a) - ts(b));
    if (sort === 'pending') {
      // Uncontacted first, then by createdAt desc
      return [...filtered].sort((a, b) => {
        const aPending = a.contactedAt ? 1 : 0;
        const bPending = b.contactedAt ? 1 : 0;
        if (aPending !== bPending) return aPending - bPending;
        return ts(b) - ts(a);
      });
    }
    return [...filtered].sort((a, b) => ts(b) - ts(a)); // newest default
  }, [filtered, sort]);

  // ── Paginate ────────────────────────────────────────────────
  const total = sorted.length;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageRows = useMemo(
    () => sorted.slice(offset, offset + PAGE_SIZE),
    [sorted, offset],
  );

  // If filter shrinks the list past current offset, reset to page 1
  useEffect(() => {
    if (offset > 0 && offset >= total && total > 0) {
      updateParams({ offset: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, offset]);

  const onPageChange = (nextPage) => {
    updateParams({ offset: (nextPage - 1) * PAGE_SIZE });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Mark-contacted completion ────────────────────────────────
  const handleMarkComplete = ({ outcome }) => {
    queryClient.invalidateQueries({ queryKey: ['employerLeads'] });
    if (outcome === 'success') {
      setToast({ message: 'Lead marked contacted', type: 'success' });
    } else if (outcome === 'conflict') {
      setToast({
        message: 'This lead was marked contacted by another operator. Refreshed.',
        type: 'warning',
      });
    }
  };

  // ── Render ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div>
        <Header subtitle="Loading…" />
        <div className="leads-state">
          <LoadingSpinner label="Loading employer leads" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <Header subtitle="Could not load" />
        <ErrorState
          title="Could not load employer leads"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      </div>
    );
  }

  const subtitle = `${apiTotal.toLocaleString()} captured · ${counts.pending.toLocaleString()} pending follow-up`;

  return (
    <div>
      <Header subtitle={subtitle} isFetching={isFetching} />

      {/* Pills + Sort */}
      <div className="leads-controls">
        <div className="leads-pills" role="tablist" aria-label="Filter by contacted state">
          <Pill
            label="All"
            count={counts.all}
            active={filter === 'all'}
            onClick={() => updateParams({ filter: null, offset: null })}
          />
          <Pill
            label="Pending"
            count={counts.pending}
            active={filter === 'pending'}
            onClick={() => updateParams({ filter: 'pending', offset: null })}
          />
          <Pill
            label="Contacted"
            count={counts.contacted}
            active={filter === 'contacted'}
            onClick={() => updateParams({ filter: 'contacted', offset: null })}
          />
        </div>
        <div className="leads-sort">
          <span className="leads-sort-label">Sort</span>
          <select
            className="leads-sort-select"
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value, offset: null })}
            aria-label="Sort leads"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List or empty state */}
      {apiTotal === 0 ? (
        <div className="leads-state">
          <span className="leads-state-icon" aria-hidden="true">∅</span>
          No employer leads captured yet.
        </div>
      ) : pageRows.length === 0 ? (
        <div className="leads-state">
          No {filter} leads.
        </div>
      ) : (
        <>
          <div className={'leads-list' + (isFetching ? ' is-stale' : '')}>
            {pageRows.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onMark={() =>
                  setModalLead({
                    id: lead.id,
                    employerName: lead.company,
                    contactEmail: lead.email,
                  })
                }
              />
            ))}
          </div>

          {total > PAGE_SIZE && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onChange={onPageChange}
            />
          )}
        </>
      )}

      {/* Modal */}
      <MarkContactedModal
        leadId={modalLead?.id}
        employerName={modalLead?.employerName}
        contactEmail={modalLead?.contactEmail}
        isOpen={modalLead !== null}
        onClose={() => setModalLead(null)}
        onComplete={handleMarkComplete}
      />

      {/* Toast */}
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

/* ─── Header ─────────────────────────────────────────────────────────── */
function Header({ subtitle, isFetching }) {
  return (
    <header className="leads-header">
      <div>
        <h1 className="leads-title">Employer Leads</h1>
        <div className="leads-subtitle">
          {subtitle}
          {isFetching && <span className="leads-fetching"> · refreshing…</span>}
        </div>
      </div>
    </header>
  );
}

function Pill({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={'leads-pill' + (active ? ' active' : '')}
      onClick={onClick}
    >
      {label}
      <span className="leads-pill-count">{count}</span>
    </button>
  );
}

/* ─── Lead card ──────────────────────────────────────────────────────── */
function LeadCard({ lead, onMark }) {
  const isContacted = !!lead.contactedAt;
  const cardClass = 'lead-card ' + (isContacted ? 'lead-card-contacted' : 'lead-card-pending');

  // The backend only exposes `company` (no contactName/phone/size/industry).
  // Render what we have; suppress missing sections cleanly.
  const employerName = lead.company || '—';
  const email = lead.email || '';

  return (
    <article className={cardClass}>
      {/* Header */}
      <div className="lead-header">
        <div className="lead-employer-block">
          <span className="lead-employer">{employerName}</span>
          {lead.source && <span className="lead-source-chip">{lead.source.replace(/_/g, ' ')}</span>}
        </div>
        <div className="lead-meta-block">
          <span
            className={
              'lead-status ' + (isContacted ? 'lead-status-contacted' : 'lead-status-pending')
            }
          >
            {isContacted ? '✓ Contacted' : 'Pending'}
          </span>
          <span className="lead-age" title={lead.createdAt}>
            {timeAgo(lead.createdAt)}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="lead-body">
        {email && (
          <div className="lead-contact-row">
            <a className="lead-contact-email" href={`mailto:${email}`}>
              {email}
            </a>
          </div>
        )}

        <div className="lead-context-row">
          {lead.credentialId && (
            <span className="lead-source">
              From:{' '}
              <Link to={`/credentials/${lead.credentialId}`} title="Open credential detail">
                {lead.credentialId}
              </Link>
            </span>
          )}
          {lead.verifiedStatus && (
            <span className="lead-verified-status">
              Verified status at capture:{' '}
              <strong style={{ color: 'var(--white)' }}>{lead.verifiedStatus}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="lead-footer">
        {!isContacted ? (
          <button type="button" className="lead-mark-btn" onClick={onMark}>
            Mark as Contacted
          </button>
        ) : (
          <div className="lead-contacted-meta">
            <div>
              Contacted <strong title={lead.contactedAt}>{timeAgo(lead.contactedAt)}</strong>
              {lead.contactedBy && (
                <>
                  {' '}by <strong>{lead.contactedBy}</strong>
                </>
              )}
            </div>
            {lead.contactNote && (
              <div className="lead-contacted-note">"{lead.contactNote}"</div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
