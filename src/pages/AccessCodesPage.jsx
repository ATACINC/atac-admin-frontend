import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiCreateSandboxCode,
  apiGetSandboxCodes,
  apiSetSandboxCodeActive,
} from '../api/client';
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

// Backend 400 codes -> the form field the message belongs beside. These are the
// exact strings the issue path emits (services/sandbox-codes.js normalizeInput);
// anything unmapped falls back to a form-level message, so a server message is
// always shown somewhere.
const ERROR_FIELD = {
  LABEL_REQUIRED: 'label',
  LABEL_TOO_LONG: 'label',
  SCENARIO_UNKNOWN: 'scenarios',
  SCENARIOS_INVALID: 'scenarios',
  MAX_ATTEMPTS_RANGE: 'attempts',
  EXPIRES_INVALID: 'expires',
  EXPIRES_IN_PAST: 'expires',
};

// Expiry presets. The offset is applied at SUBMIT time, not when the operator
// picks it, so a form left open for an hour still sends a future timestamp.
const EXPIRY_NEVER = 'never';
const EXPIRY_CUSTOM = 'custom';
const EXPIRY_PRESETS = [
  { value: EXPIRY_NEVER,  label: 'Never' },
  { value: '24h',         label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { value: '7d',          label: '7 days',   ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d',         label: '30 days',  ms: 30 * 24 * 60 * 60 * 1000 },
  { value: EXPIRY_CUSTOM, label: 'Custom' },
];

// Messages for the two expiry 400s, reused for the client-side pre-check so the
// operator reads the same words whichever side rejects the value.
const EXPIRY_INVALID_MSG = 'Expiry must be a valid date.';
const EXPIRY_PAST_MSG = 'Expiry must be in the future.';

// The list endpoint may return a bare array or wrap it; accept either.
function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.codes)) return data.codes;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function codeOf(row) {
  return row?.code ?? row?.accessCode ?? row?.access_code;
}

// Swap one row for the object PATCH returned, preserving the container shape
// the list came back in. Only called on success, so a failed toggle leaves the
// cached list exactly as it was.
function replaceRow(data, updated) {
  const target = codeOf(updated);
  if (!target) return data;
  const swap = (list) => list.map((r) => (codeOf(r) === target ? { ...r, ...updated } : r));
  if (Array.isArray(data)) return swap(data);
  if (Array.isArray(data?.codes)) return { ...data, codes: swap(data.codes) };
  if (Array.isArray(data?.data)) return { ...data, data: swap(data.data) };
  return data;
}

function expiresAtOf(row) {
  return row?.expiresAt ?? row?.expires_at ?? null;
}

// Has this code's expiry already passed? False for a code that never expires
// and for anything unparseable, so a bad value can never read as expired.
function isExpired(row, now = Date.now()) {
  const raw = expiresAtOf(row);
  if (!raw) return false;
  const t = Date.parse(raw);
  return Number.isFinite(t) && t <= now;
}

// The three display states, derived only for rendering. This mirrors the
// backend's own precedence (routes/sandbox.js checks active BEFORE expiry), so
// a deactivated code reads INACTIVE whether or not it has also expired. The
// console never enforces expiry; it only reflects what the API returns.
function statusOf(row, now = Date.now()) {
  const active = row?.active ?? row?.is_active;
  if (!active) return 'inactive';
  if (isExpired(row, now)) return 'expired';
  return 'active';
}

const STATUS_LABEL = { active: 'Active', inactive: 'Inactive', expired: 'Expired' };

// Turn the form's expiry choice into an ISO string, or null for "never".
// Throws a message string for a custom value that cannot be used.
function resolveExpiry(mode, customValue, now = Date.now()) {
  if (mode === EXPIRY_NEVER) return null;
  if (mode === EXPIRY_CUSTOM) {
    if (!customValue) throw EXPIRY_INVALID_MSG;
    // datetime-local yields local wall-clock time; Date parses it as local and
    // toISOString converts to UTC, which is what the backend stores.
    const t = new Date(customValue).getTime();
    if (!Number.isFinite(t)) throw EXPIRY_INVALID_MSG;
    if (t <= now) throw EXPIRY_PAST_MSG;
    return new Date(t).toISOString();
  }
  const preset = EXPIRY_PRESETS.find((p) => p.value === mode);
  if (!preset || !preset.ms) throw EXPIRY_INVALID_MSG;
  return new Date(now + preset.ms).toISOString();
}

// Absolute local timestamp for the table. Falls back to the raw string rather
// than throwing if the API ever sends something unparseable.
function formatExpiry(raw) {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return String(raw);
  return new Date(t).toLocaleString();
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
  // Expiry defaults to never, matching every code issued before expiry existed.
  const [expiryMode, setExpiryMode] = useState(EXPIRY_NEVER);
  const [expiryCustom, setExpiryCustom] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [issued, setIssued] = useState(null);
  const [toast, setToast] = useState(null);
  // Code awaiting the deactivate confirm, and the code with a PATCH in flight.
  const [pendingRow, setPendingRow] = useState(null);
  const [busyCode, setBusyCode] = useState(null);

  const queryClient = useQueryClient();

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
    // Pre-check the custom expiry so an obviously dead date is caught without a
    // round trip. The server still validates; this only saves a request.
    try {
      resolveExpiry(expiryMode, expiryCustom);
    } catch (msg) {
      next.expires = typeof msg === 'string' ? msg : EXPIRY_INVALID_MSG;
    }
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // Omit maxAttempts and expires entirely when unset; never send null or 0.
    const body = { label: label.trim(), scenarios: [...selected] };
    if (attempts !== '') body.maxAttempts = Number(attempts);
    // Resolved here, not at pick time, so a preset is measured from submit.
    const expiresIso = resolveExpiry(expiryMode, expiryCustom);
    if (expiresIso) body.expires = expiresIso;

    setSubmitting(true);
    setIssued(null);
    try {
      const created = await apiCreateSandboxCode(body);
      setIssued(created);
      setLabel('');
      setSelected([]);
      setAttempts('');
      setExpiryMode(EXPIRY_NEVER);
      setExpiryCustom('');
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

  // Deactivate / reactivate. On success the returned object replaces the row in
  // place (PATCH returns the same shape the list does). On failure the row and
  // the rest of the table are left untouched and only a Toast reports it.
  const setActive = async (code, active) => {
    if (busyCode) return;
    setBusyCode(code);
    try {
      const updated = await apiSetSandboxCodeActive(code, active);
      queryClient.setQueryData(['sandboxCodes'], (prev) => replaceRow(prev, updated));
      setToast({ message: active ? 'Code reactivated.' : 'Code deactivated.', type: 'success' });
    } catch (err) {
      if (err?.response?.status === 401) return; // interceptor routes to /login
      const message = err?.response?.data?.error || err?.response?.data?.message;
      setToast({
        message: message || (active ? 'Could not reactivate the code.' : 'Could not deactivate the code.'),
        type: 'error',
      });
    } finally {
      setBusyCode(null);
    }
  };

  const confirmDeactivate = () => {
    const code = codeOf(pendingRow);
    setPendingRow(null);
    if (code) setActive(code, false);
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

          {/* Expires */}
          <div className="ac-field">
            <span className="ac-label">Expires</span>
            <div className="ac-expiry-choices" role="group" aria-label="Expiry">
              {EXPIRY_PRESETS.map((p) => (
                <label key={p.value} className="ac-radio">
                  <input
                    type="radio"
                    name="ac-expiry"
                    value={p.value}
                    checked={expiryMode === p.value}
                    disabled={submitting}
                    onChange={() => {
                      setExpiryMode(p.value);
                      if (errors.expires) setErrors((prev) => ({ ...prev, expires: '' }));
                    }}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
            {expiryMode === EXPIRY_CUSTOM && (
              <input
                id="ac-expiry-input"
                className={'ac-input ac-expiry-input' + (errors.expires ? ' has-error' : '')}
                type="datetime-local"
                value={expiryCustom}
                disabled={submitting}
                aria-label="Custom expiry date and time"
                onChange={(e) => {
                  setExpiryCustom(e.target.value);
                  if (errors.expires) setErrors((prev) => ({ ...prev, expires: '' }));
                }}
              />
            )}
            <div className="ac-helper">
              When the code stops working. Leave on Never for no expiry. Presets count from
              the moment you issue.
            </div>
            {errors.expires && <div className="ac-error" role="alert">{errors.expires}</div>}
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
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <CodeRow
                    key={(row.code ?? row.id ?? i) + ''}
                    row={row}
                    busy={busyCode === codeOf(row)}
                    disabled={!!busyCode}
                    onDeactivate={() => setPendingRow(row)}
                    onReactivate={() => setActive(codeOf(row), true)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DeactivateConfirm
        row={pendingRow}
        onCancel={() => setPendingRow(null)}
        onConfirm={confirmDeactivate}
      />

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}

/* --- Deactivate confirm ----------------------------------------------- */
// The console has no shared confirm component; each flow ships its own modal
// (RevokeModal, MarkContactedModal). This mirrors that structure and styling:
// destructive intent is carried by the red border and title, not a red button.
function DeactivateConfirm({ row, onCancel, onConfirm }) {
  const open = !!row;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;
  const code = codeOf(row);

  return (
    <div
      className="ac-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ac-deactivate-title"
      onClick={onCancel}
    >
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="ac-deactivate-title" className="ac-modal-title">Deactivate code?</h2>
        <p className="ac-modal-body">
          Candidates can no longer use <span className="ac-modal-code">{code}</span> once
          deactivated. You can reactivate it later.
        </p>
        <div className="ac-modal-actions">
          <button type="button" className="ac-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ac-submit" onClick={onConfirm} autoFocus>
            Deactivate
          </button>
        </div>
      </div>
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
function CodeRow({ row, busy, disabled, onDeactivate, onReactivate }) {
  const code = row.code ?? row.accessCode ?? row.access_code ?? '--';
  const max = row.maxAttempts ?? row.max_attempts;
  const used = row.attemptsUsed ?? row.attempts_used ?? row.users ?? 0;
  const created = row.createdAt ?? row.created_at;
  const active = row.active ?? row.is_active;
  const scenarios = scenarioCodesOf(row);
  // Derived at render. There is no timer: an open tab will not flip a row to
  // Expired on its own, it re-derives on the next render or refresh.
  const status = statusOf(row);
  const expiresRaw = expiresAtOf(row);
  const expiresText = formatExpiry(expiresRaw);
  // Reactivating a code whose expiry has passed leaves it unusable, and there
  // is no endpoint to change an expiry, so say so before the click.
  const showExpiredHint = !active && isExpired(row);

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
        <span className={'ac-status is-' + status}>{STATUS_LABEL[status]}</span>
      </td>
      <td className="ac-dim" title={expiresRaw || ''}>
        {expiresText || <span className="ac-dim">Never</span>}
      </td>
      <td className="ac-dim" title={created || ''}>
        {created ? timeAgo(created) : '--'}
      </td>
      <td>
        <button
          type="button"
          className="ac-action-btn"
          disabled={disabled}
          onClick={active ? onDeactivate : onReactivate}
        >
          {busy ? 'Working...' : active ? 'Deactivate' : 'Reactivate'}
        </button>
        {showExpiredHint && (
          <div className="ac-action-hint">
            Past its expiry. Reactivating will not make it usable; issue a new code.
          </div>
        )}
      </td>
    </tr>
  );
}
