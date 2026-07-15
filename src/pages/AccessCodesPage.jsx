import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiCreateSandboxCode, apiGetSandboxCodes } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import Toast from '../components/Toast';
import CopyButton from '../components/CopyButton';
import { timeAgo } from '../utils/timeAgo';
import './AccessCodesPage.css';

// The console has no scenario catalog endpoint, so the five known sandbox
// scenarios are listed here. Keep in sync with the backend catalog.
const SCENARIOS = [
  { code: 'SC-002', name: 'Linda',    sector: 'Healthcare member services' },
  { code: 'SC-009', name: 'Margaret', sector: 'Mobile and telecom' },
  { code: 'SC-010', name: 'Dev',      sector: 'Credit card' },
  { code: 'SC-011', name: 'Walter',   sector: 'Broadband' },
  { code: 'SC-012', name: 'Aisha',    sector: 'Internet' },
];

const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 20;

// Backend 400 codes -> the form field the message belongs beside. Anything
// unrecognized (including EXPIRES_UNSUPPORTED, which we never trigger since
// the form has no expiry field) falls back to a form-level message.
const ERROR_FIELD = {
  MISSING_LABEL: 'label',
  UNKNOWN_SCENARIO: 'scenarios',
  INVALID_ATTEMPTS: 'attempts',
  EXPIRES_UNSUPPORTED: 'form',
};

// The list endpoint may return a bare array or wrap it; accept either.
function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.codes)) return data.codes;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

// Scenarios may come back as codes or as objects; render codes either way.
function scenarioCodesOf(row) {
  const raw = row.scenarios ?? row.allowedScenarios ?? row.allowed_scenarios ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => (typeof s === 'string' ? s : s?.code)).filter(Boolean);
}

export default function AccessCodesPage() {
  const [label, setLabel] = useState('');
  const [selected, setSelected] = useState([]);
  const [attempts, setAttempts] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [issued, setIssued] = useState(null);
  const [toast, setToast] = useState(null);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['sandboxCodes'],
    queryFn: apiGetSandboxCodes,
    placeholderData: (prev) => prev,
  });

  const rows = normalizeRows(data);

  const toggleScenario = (code) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
    setErrors((prev) => ({ ...prev, scenarios: '', form: '' }));
  };

  const validate = () => {
    const next = {};
    if (!label.trim()) next.label = 'Label is required.';
    if (selected.length === 0) next.scenarios = 'Pick at least one scenario.';
    if (attempts !== '') {
      const n = Number(attempts);
      if (!Number.isInteger(n) || n < MIN_ATTEMPTS || n > MAX_ATTEMPTS) {
        next.attempts = `Attempts must be a whole number from ${MIN_ATTEMPTS} to ${MAX_ATTEMPTS}.`;
      }
    }
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // Omit maxAttempts entirely when blank; never send null or 0. No expiry
    // field: the backend has no expiry column.
    const body = { label: label.trim(), scenarios: [...selected] };
    if (attempts !== '') body.maxAttempts = Number(attempts);

    setSubmitting(true);
    setIssued(null);
    try {
      const created = await apiCreateSandboxCode(body);
      setIssued(created);
      setLabel('');
      setSelected([]);
      setAttempts('');
      setErrors({});
      setToast({ message: 'Access code issued', type: 'success' });
      refetch();
    } catch (err) {
      const status = err?.response?.status;
      const payload = err?.response?.data || {};
      const message = payload.error || payload.message;
      if (status === 401) {
        // The api client interceptor clears the token and routes to /login.
        return;
      }
      if (status === 400) {
        const field = ERROR_FIELD[payload.code] || 'form';
        setErrors({ [field]: message || 'Could not issue the code. Check the form and try again.' });
        return;
      }
      setErrors({ form: message || 'Could not issue the code. Please try again.' });
      setToast({ message: 'Could not issue the code', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const issuedCode = issued && (issued.code ?? issued.accessCode ?? issued.access_code);
  const subtitle = isLoading
    ? 'Loading...'
    : `${rows.length.toLocaleString()} issued`;

  return (
    <div>
      <Header subtitle={subtitle} isFetching={isFetching && !isLoading} />

      {/* -- A. Issue a code ------------------------------------------- */}
      <section className="ac-panel">
        <h2 className="ac-panel-title">Issue a code</h2>

        <form className="ac-form" onSubmit={handleSubmit} noValidate>
          {/* Label */}
          <div className="ac-field">
            <label className="ac-label" htmlFor="ac-label-input">Label</label>
            <input
              id="ac-label-input"
              className={'ac-input' + (errors.label ? ' has-error' : '')}
              type="text"
              value={label}
              maxLength={120}
              disabled={submitting}
              placeholder="Northgate partner demo"
              onChange={(e) => {
                setLabel(e.target.value);
                if (errors.label) setErrors((p) => ({ ...p, label: '' }));
              }}
            />
            <div className="ac-helper">Who this code is for (e.g. Northgate partner demo).</div>
            {errors.label && <div className="ac-error" role="alert">{errors.label}</div>}
          </div>

          {/* Scenarios */}
          <div className="ac-field">
            <span className="ac-label">Scenarios</span>
            <div className="ac-checks">
              {SCENARIOS.map((s) => (
                <label key={s.code} className="ac-check">
                  <input
                    type="checkbox"
                    checked={selected.includes(s.code)}
                    disabled={submitting}
                    onChange={() => toggleScenario(s.code)}
                  />
                  <span className="ac-check-code">{s.code}</span>
                  <span className="ac-check-name">{s.name}</span>
                  <span className="ac-check-sector">{s.sector}</span>
                </label>
              ))}
            </div>
            <div className="ac-helper">
              Pick one for a single scenario, or several to give the candidate a picker.
            </div>
            {errors.scenarios && <div className="ac-error" role="alert">{errors.scenarios}</div>}
          </div>

          {/* Attempts */}
          <div className="ac-field ac-field-narrow">
            <label className="ac-label" htmlFor="ac-attempts-input">Attempts</label>
            <input
              id="ac-attempts-input"
              className={'ac-input' + (errors.attempts ? ' has-error' : '')}
              type="number"
              min={MIN_ATTEMPTS}
              max={MAX_ATTEMPTS}
              step={1}
              value={attempts}
              disabled={submitting}
              placeholder="Default (2)"
              onChange={(e) => {
                setAttempts(e.target.value);
                if (errors.attempts) setErrors((p) => ({ ...p, attempts: '' }));
              }}
            />
            <div className="ac-helper">Scored attempts. Leave blank for the platform default.</div>
            {errors.attempts && <div className="ac-error" role="alert">{errors.attempts}</div>}
          </div>

          {errors.form && <div className="ac-error ac-error-form" role="alert">{errors.form}</div>}

          <div className="ac-actions">
            <button type="submit" className="ac-submit" disabled={submitting}>
              {submitting ? 'Issuing...' : 'Issue Code'}
            </button>
          </div>
        </form>

        {/* Issued code */}
        {issuedCode && (
          <div className="ac-issued" role="status">
            <div className="ac-issued-head">New code</div>
            <div className="ac-issued-row">
              <span className="ac-issued-code">{issuedCode}</span>
              <CopyButton text={issuedCode} label="Copy" />
            </div>
            <div className="ac-issued-hint">
              Send this code to the candidate; they enter it at app.atacglobalcx.com/sandbox.
            </div>
          </div>
        )}
      </section>

      {/* -- B. Existing codes ----------------------------------------- */}
      <section className="ac-panel">
        <h2 className="ac-panel-title">Existing codes</h2>

        {isLoading ? (
          <div className="ac-state">
            <LoadingSpinner label="Loading access codes" />
          </div>
        ) : isError ? (
          <ErrorState
            title="Could not load access codes"
            message={error?.response?.data?.error || error?.message || 'Unknown error.'}
            onRetry={refetch}
          />
        ) : rows.length === 0 ? (
          <div className="ac-state">No access codes issued yet.</div>
        ) : (
          <div className={'ac-table-wrap' + (isFetching ? ' is-stale' : '')}>
            <table className="ac-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Label</th>
                  <th>Scenarios</th>
                  <th>Attempts</th>
                  <th>Used</th>
                  <th>Active</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <CodeRow key={(row.code ?? row.id ?? i) + ''} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}

/* --- Header ----------------------------------------------------------- */
function Header({ subtitle, isFetching }) {
  return (
    <header className="ac-header">
      <div>
        <h1 className="ac-title">Access Codes</h1>
        <div className="ac-subtitle">
          {subtitle}
          {isFetching && <span className="ac-fetching"> - refreshing...</span>}
        </div>
      </div>
    </header>
  );
}

/* --- Row -------------------------------------------------------------- */
// Defensive field reads: the API may emit camelCase or snake_case.
function CodeRow({ row }) {
  const code = row.code ?? row.accessCode ?? row.access_code ?? '--';
  const max = row.maxAttempts ?? row.max_attempts;
  const used = row.attemptsUsed ?? row.attempts_used ?? row.users ?? 0;
  const created = row.createdAt ?? row.created_at;
  const active = row.active ?? row.is_active;
  const scenarios = scenarioCodesOf(row);

  return (
    <tr>
      <td>
        <span className="ac-code-cell">{code}</span>
      </td>
      <td className="ac-label-cell">{row.label || '--'}</td>
      <td>
        <span className="ac-chips">
          {scenarios.length === 0
            ? <span className="ac-dim">--</span>
            : scenarios.map((s) => <span key={s} className="ac-chip">{s}</span>)}
        </span>
      </td>
      <td className="ac-num">
        {max === null || max === undefined ? <span className="ac-dim">Default</span> : max}
      </td>
      <td className="ac-num">{used}</td>
      <td>
        <span className={'ac-status ' + (active ? 'is-active' : 'is-inactive')}>
          {active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="ac-dim" title={created || ''}>
        {created ? timeAgo(created) : '--'}
      </td>
    </tr>
  );
}
