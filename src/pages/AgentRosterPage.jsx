import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiGetAgentRoster, apiAddAgent, apiInviteAgent, apiUpdateAgent, apiDownloadAgreementPdf,
} from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import Toast from '../components/Toast';
import { timeAgo } from '../utils/timeAgo';
import './EmployerLeadsPage.css';

// ATAC Anagenesis agent roster. Replaces the Cognito "New Agent Added" form and
// carries each agent's signed MSA + NDA. Flow: Accept in Arise -> Add + invite
// here -> agent signs -> Finalize in Arise -> mark Finalized here.
const STATUSES = ['invited', 'signed', 'finalized', 'active', 'inactive', 'declined'];
const LABEL = {
  invited: 'Invited', signed: 'Signed', finalized: 'Finalized', active: 'Active', inactive: 'Inactive', declined: 'Declined',
};
const NETWORKS = ['Arise', 'ATAC ANAGEN BPO'];
const EMPTY = { firstName: '', lastName: '', email: '', phone: '', cspId: '', network: 'Arise', adpStatus: '', internalNotes: '', sendInvite: true };

export default function AgentRosterPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['agentRoster'],
    queryFn: () => apiGetAgentRoster(),
    refetchInterval: 60_000,
  });
  const agents = useMemo(() => data?.agents || [], [data]);

  const counts = useMemo(() => {
    const c = { all: agents.length };
    STATUSES.forEach((st) => { c[st] = agents.filter((a) => a.status === st).length; });
    return c;
  }, [agents]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => (filter === 'all' || a.status === filter) &&
      (!q || [a.first_name, a.last_name, a.email, a.phone, a.csp_id, a.network].join(' ').toLowerCase().includes(q)));
  }, [agents, filter, search]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['agentRoster'] });
  const errMsg = (e, fallback) => e?.response?.data?.error || fallback;

  async function addAgent(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await apiAddAgent(form);
      await refresh();
      setForm(EMPTY); setShowAdd(false);
      setToast({ message: r.signLink ? 'Agent added and signing link emailed' : 'Agent added (no email sent)', type: 'success' });
    } catch (err) {
      setToast({ message: errMsg(err, 'Could not add agent'), type: 'warning' });
    } finally { setSaving(false); }
  }

  async function invite(a) {
    setBusyId(a.id);
    try {
      const r = await apiInviteAgent(a.id);
      await refresh();
      try { await navigator.clipboard.writeText(r.signLink); } catch { /* clipboard is optional */ }
      setToast({ message: `Signing link emailed to ${a.email} (also copied)`, type: 'success' });
    } catch (err) {
      setToast({ message: errMsg(err, 'Could not send invite'), type: 'warning' });
    } finally { setBusyId(null); }
  }

  async function update(a, patch, msg) {
    setBusyId(a.id);
    try {
      await apiUpdateAgent(a.id, patch);
      await refresh();
      if (msg) setToast({ message: msg, type: 'success' });
    } catch (err) {
      setToast({ message: errMsg(err, 'Could not update'), type: 'warning' });
    } finally { setBusyId(null); }
  }

  async function downloadPdf(a, ag) {
    try {
      const blob = await apiDownloadAgreementPdf(ag.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `ATAC_Anagenesis_${ag.docType.toUpperCase()}_${a.first_name}_${a.last_name}.pdf`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch { setToast({ message: 'Download failed', type: 'warning' }); }
  }

  if (isLoading) return <div><Head sub="Loading…" /><div className="leads-state"><LoadingSpinner label="Loading roster" /></div></div>;
  if (isError) return <div><Head sub="Could not load" /><ErrorState title="Could not load the agent roster" message={error?.response?.data?.error || error?.message} onRetry={refetch} /></div>;

  const sub = `${agents.length} agents · ${counts.invited} awaiting signature · ${counts.signed} signed, not finalized`;
  const inp = { padding: '8px 10px', minWidth: 0, width: '100%', boxSizing: 'border-box' };

  return (
    <div>
      <Head sub={sub} fetching={isFetching} onAdd={() => setShowAdd((v) => !v)} />

      {showAdd && (
        <form className="lead-card" onSubmit={addAgent} style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <input className="leads-sort-select" style={inp} placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            <input className="leads-sort-select" style={inp} placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            <input className="leads-sort-select" style={inp} placeholder="Email (as in Arise)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <input className="leads-sort-select" style={inp} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="leads-sort-select" style={inp} placeholder="CSP ID" value={form.cspId} onChange={(e) => setForm({ ...form, cspId: e.target.value })} />
            <select className="leads-sort-select" style={inp} value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })}>
              {NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <input className="leads-sort-select" style={inp} placeholder="ADP status (optional)" value={form.adpStatus} onChange={(e) => setForm({ ...form, adpStatus: e.target.value })} />
            <input className="leads-sort-select" style={inp} placeholder="Internal notes" value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={form.sendInvite} onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })} />
              Email the MSA + NDA signing link now
            </label>
            <button type="submit" className="lead-mark-btn" disabled={saving}>{saving ? 'Saving…' : 'Add agent'}</button>
          </div>
        </form>
      )}

      <div className="leads-controls">
        <div className="leads-pills" role="tablist">
          {['all', ...STATUSES].map((st) => (
            <button key={st} type="button" role="tab" aria-selected={filter === st}
              className={'leads-pill' + (filter === st ? ' active' : '')} onClick={() => setFilter(st)}>
              {st === 'all' ? 'All' : LABEL[st]}<span className="leads-pill-count">{counts[st] || 0}</span>
            </button>
          ))}
        </div>
        <div className="leads-sort">
          <input className="leads-sort-select" style={{ minWidth: 220 }} placeholder="Search name, email, CSP ID"
            value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search roster" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="leads-state">{agents.length === 0 ? 'No agents yet. Click Add agent after you Accept someone in Arise.' : 'No agents match.'}</div>
      ) : (
        <div className={'leads-list' + (isFetching ? ' is-stale' : '')}>
          {rows.map((a) => {
            const signed = (a.agreements || []);
            const next = a.status === 'invited'
              ? (a.invite_sent_at ? `Waiting for signature. Link sent ${timeAgo(a.invite_sent_at)}${a.invite_count > 1 ? ` (${a.invite_count} sends)` : ''}.` : 'Not invited yet: send the signing link.')
              : a.status === 'signed' ? 'Signed. Once Arise agreements show signed, click Finalize in Arise, then mark Finalized here.' : null;
            return (
              <article key={a.id} className={'lead-card ' + (a.status === 'invited' ? 'lead-card-pending' : 'lead-card-contacted')}>
                <div className="lead-header">
                  <div className="lead-employer-block">
                    <span className="lead-employer">{a.first_name} {a.last_name}</span>
                    <span className="lead-source-chip">{a.network}</span>
                    {a.source === 'cognito_import' && <span className="lead-source-chip">Cognito import</span>}
                  </div>
                  <div className="lead-meta-block">
                    <span className={'lead-status ' + (a.status === 'invited' ? 'lead-status-pending' : 'lead-status-contacted')}>{LABEL[a.status] || a.status}</span>
                    <span className="lead-age" title={a.date_added}>added {String(a.date_added).slice(0, 10)}</span>
                  </div>
                </div>
                <div className="lead-body">
                  <div className="lead-contact-row">
                    <a className="lead-contact-email" href={`mailto:${a.email}`}>{a.email}</a>
                    {a.phone && <span style={{ marginLeft: 12 }}>{a.phone}</span>}
                  </div>
                  <div className="lead-context-row">
                    <span>CSP ID: <strong>{a.csp_id || 'n/a'}</strong></span>
                    <span>ADP: <strong>{a.adp_status || 'n/a'}</strong></span>
                    <span>
                      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!a.glip_added} disabled={busyId === a.id}
                          onChange={(e) => update(a, { glipAdded: e.target.checked })} />
                        Added to team chat
                      </label>
                    </span>
                    <span>Agreements: {signed.length === 0 ? <strong>none</strong> : signed.map((ag) => (
                      <button key={ag.id} type="button" className="lead-mark-btn" style={{ marginLeft: 6, padding: '2px 8px' }} onClick={() => downloadPdf(a, ag)}>
                        {ag.docType.toUpperCase()} PDF
                      </button>
                    ))}</span>
                  </div>
                  {a.internal_notes && <div className="lead-contacted-note">"{a.internal_notes}"</div>}
                </div>
                <div className="lead-footer">
                  <div className="lead-contacted-meta">
                    {next && <div style={{ marginBottom: 6 }}>{next}</div>}
                    {a.signed_at && <div>Signed {timeAgo(a.signed_at)}</div>}
                    {a.finalized_at && <div>Finalized {timeAgo(a.finalized_at)}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {!a.signed_at && (
                      <button type="button" className="lead-mark-btn" disabled={busyId === a.id} onClick={() => invite(a)}>
                        {a.invite_sent_at ? 'Resend link' : 'Send signing link'}
                      </button>
                    )}
                    <select className="leads-sort-select" value={a.status} disabled={busyId === a.id}
                      onChange={(e) => update(a, { status: e.target.value }, `${a.first_name} ${a.last_name}: ${LABEL[e.target.value]}`)} aria-label="Change status">
                      {STATUSES.map((st) => <option key={st} value={st}>{LABEL[st]}</option>)}
                    </select>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

function Head({ sub, fetching, onAdd }) {
  return (
    <header className="leads-header">
      <div>
        <h1 className="leads-title">Agent Roster</h1>
        <div className="leads-subtitle">{sub}{fetching && <span className="leads-fetching"> · refreshing…</span>}</div>
      </div>
      {onAdd && <button type="button" className="lead-mark-btn" onClick={onAdd}>Add agent</button>}
    </header>
  );
}
