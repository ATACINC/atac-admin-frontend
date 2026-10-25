import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGetAriseLeads, apiSetAriseLeadStatus, apiExportAriseLeads } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import Toast from '../components/Toast';
import { timeAgo } from '../utils/timeAgo';
import './EmployerLeadsPage.css';

// Arise recruiting leads from app.atacglobalcx.com/arise/apply.
// Backend caps a page at 200; we fetch one page and compute counts client-side.
const FETCH_LIMIT = 200;
const STATUSES = ['new', 'link_sent', 'registered', 'enrolled', 'certified', 'nurture', 'declined'];
const LABEL = {
  new: 'New', link_sent: 'Link sent', registered: 'Registered', enrolled: 'Enrolled',
  certified: 'Certified', nurture: 'Nurture (CRSA)', declined: 'Declined',
};
const yn = (v) => (v === true ? 'Yes' : v === false ? 'No' : '?');

export default function AriseLeadsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['ariseLeads'],
    queryFn: () => apiGetAriseLeads({ limit: FETCH_LIMIT, offset: 0 }),
    refetchInterval: 60_000,
  });
  const leads = useMemo(() => data?.leads || [], [data]);
  const total = data?.total ?? leads.length;

  const counts = useMemo(() => {
    const c = { all: leads.length };
    STATUSES.forEach((s) => { c[s] = leads.filter((l) => l.status === s).length; });
    return c;
  }, [leads]);

  const sources = useMemo(() => {
    const m = {};
    leads.forEach((l) => { const k = l.source || 'landing'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => (filter === 'all' || l.status === filter) &&
      (!q || [l.first_name, l.last_name, l.email, l.phone, l.csp_id, l.province, l.source].join(' ').toLowerCase().includes(q)));
  }, [leads, filter, search]);

  async function changeStatus(lead, status) {
    setBusyId(lead.id);
    try {
      await apiSetAriseLeadStatus(lead.id, status);
      await qc.invalidateQueries({ queryKey: ['ariseLeads'] });
      setToast({ message: `${lead.first_name} ${lead.last_name}: ${LABEL[status]}`, type: 'success' });
    } catch (e) {
      setToast({ message: e?.response?.data?.error || 'Could not update status', type: 'warning' });
    } finally { setBusyId(null); }
  }

  async function exportCsv() {
    try {
      const blob = await apiExportAriseLeads();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `arise-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { setToast({ message: 'Export failed', type: 'warning' }); }
  }

  if (isLoading) return <div><Head sub="Loading…" /><div className="leads-state"><LoadingSpinner label="Loading Arise leads" /></div></div>;
  if (isError) return <div><Head sub="Could not load" /><ErrorState title="Could not load Arise leads" message={error?.response?.data?.error || error?.message} onRetry={refetch} /></div>;

  const sub = `${total.toLocaleString()} applications · ${counts.new} new · ${counts.nurture} nurture` + (total > FETCH_LIMIT ? ` · showing latest ${FETCH_LIMIT}` : '');

  return (
    <div>
      <Head sub={sub} fetching={isFetching} onExport={exportCsv} />

      {sources.length > 0 && (
        <div className="leads-subtitle" style={{ margin: '0 0 12px' }}>
          By source: {sources.map(([k, n]) => `${k} ${n}`).join(' · ')}
        </div>
      )}

      <div className="leads-controls">
        <div className="leads-pills" role="tablist">
          {['all', ...STATUSES].map((s) => (
            <button key={s} type="button" role="tab" aria-selected={filter === s}
              className={'leads-pill' + (filter === s ? ' active' : '')} onClick={() => setFilter(s)}>
              {s === 'all' ? 'All' : LABEL[s]}<span className="leads-pill-count">{counts[s] || 0}</span>
            </button>
          ))}
        </div>
        <div className="leads-sort">
          <input className="leads-sort-select" style={{ minWidth: 220 }} placeholder="Search name, email, CSP ID"
            value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search leads" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="leads-state">{total === 0 ? 'No Arise applications yet.' : 'No leads match.'}</div>
      ) : (
        <div className={'leads-list' + (isFetching ? ' is-stale' : '')}>
          {rows.map((l) => (
            <article key={l.id} className={'lead-card ' + (l.status === 'new' ? 'lead-card-pending' : 'lead-card-contacted')}>
              <div className="lead-header">
                <div className="lead-employer-block">
                  <span className="lead-employer">{l.first_name} {l.last_name}</span>
                  <span className="lead-source-chip">{l.source || 'landing'}</span>
                  {l.arise_eligible === false && <span className="lead-source-chip">{l.province === 'QC' ? 'Quebec' : (l.country || 'Outside Canada')}</span>}
                </div>
                <div className="lead-meta-block">
                  <span className={'lead-status ' + (l.status === 'new' ? 'lead-status-pending' : 'lead-status-contacted')}>{LABEL[l.status] || l.status}</span>
                  <span className="lead-age" title={l.created_at}>{timeAgo(l.created_at)}</span>
                </div>
              </div>
              <div className="lead-body">
                <div className="lead-contact-row">
                  <a className="lead-contact-email" href={`mailto:${l.email}`}>{l.email}</a>
                  {l.phone && <span style={{ marginLeft: 12 }}>{l.phone}</span>}
                </div>
                <div className="lead-context-row">
                  <span>Province: <strong>{l.province}</strong></span>
                  <span>Arise: <strong>{l.on_arise ? `Yes${l.csp_id ? ' (CSP ' + l.csp_id + ')' : ''}` : 'New'}</strong></span>
                  <span>Win 11 {yn(l.has_windows11)} · Headset {yn(l.has_usb_headset)} · Webcam {yn(l.has_webcam)}</span>
                  <span>Class: <strong>{l.class_time || 'n/a'}</strong></span>
                  <span>Future contact: <strong>{l.marketing_consent ? 'Yes' : 'No'}</strong></span>
                </div>
                {l.notes && <div className="lead-contacted-note">"{l.notes}"</div>}
              </div>
              <div className="lead-footer">
                <div className="lead-contacted-meta">
                  {l.status === 'new' && l.arise_eligible !== false && (
                    <div style={{ marginBottom: 6 }}>{l.on_arise ? 'Next: check they are attached to 1221605.' : 'Next: send a referral link from link.arise.com/referral (5-day clock).'}</div>
                  )}
                  {l.referral_link_sent_at && <div>Link sent {timeAgo(l.referral_link_sent_at)}{l.contacted_by ? ` by ${l.contacted_by}` : ''}</div>}
                </div>
                <select className="leads-sort-select" value={l.status} disabled={busyId === l.id}
                  onChange={(e) => changeStatus(l, e.target.value)} aria-label="Change status">
                  {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                </select>
              </div>
            </article>
          ))}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function Head({ sub, fetching, onExport }) {
  return (
    <header className="leads-header">
      <div>
        <h1 className="leads-title">Arise Leads</h1>
        <div className="leads-subtitle">{sub}{fetching && <span className="leads-fetching"> · refreshing…</span>}</div>
      </div>
      {onExport && <button type="button" className="lead-mark-btn" onClick={onExport}>Export CSV</button>}
    </header>
  );
}
