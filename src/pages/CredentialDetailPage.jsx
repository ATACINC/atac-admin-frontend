import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGetCredential } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';
import StatusBadge from '../components/StatusBadge';
import CopyButton from '../components/CopyButton';
import Toast from '../components/Toast';
import RevokeModal from '../components/RevokeModal';
import { timeAgo } from '../utils/timeAgo';
import { humanizeDimKey } from '../utils/humanize';
import { truncateMiddle, formatLongDate } from '../utils/format';
import './CredentialDetailPage.css';

export default function CredentialDetailPage() {
  const { credentialId: rawId } = useParams();
  const credentialId = (rawId || '').toUpperCase();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [revokeOpen, setRevokeOpen] = useState(false);
  const [toast, setToast] = useState(null); // { message, type }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['credential', credentialId],
    queryFn: () => apiGetCredential(credentialId),
    placeholderData: (prev) => prev,
    retry: (failureCount, err) => {
      // Don't retry 404s
      if (err?.response?.status === 404) return false;
      return failureCount < 1;
    },
  });

  // Explicit 404 short-circuit
  const is404 = isError && error?.response?.status === 404;

  // ── Revoke completion handler from RevokeModal ────────────────
  const handleRevokeComplete = ({ outcome }) => {
    queryClient.invalidateQueries({ queryKey: ['credential', credentialId] });
    queryClient.invalidateQueries({ queryKey: ['credentials'] });
    if (outcome === 'success') {
      setToast({ message: 'Credential revoked', type: 'success' });
    } else if (outcome === 'conflict') {
      setToast({
        message: 'This credential was revoked by another operator. Refreshed.',
        type: 'warning',
      });
    }
  };

  // ── Loading ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="detail-page">
        <div className="detail-state">
          <LoadingSpinner label="Loading credential" />
        </div>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────
  if (is404) {
    return (
      <div className="detail-page">
        <Link to="/credentials" className="detail-back">
          ← Credentials
        </Link>
        <div className="detail-state">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--white)', marginBottom: 8 }}>
            Credential not found
          </div>
          <div style={{ fontSize: 13 }}>
            <code style={{ color: 'var(--gold)' }}>{credentialId}</code> doesn't exist or has been removed.
          </div>
        </div>
      </div>
    );
  }

  // ── Other errors ──────────────────────────────────────────────
  if (isError) {
    return (
      <div className="detail-page">
        <Link to="/credentials" className="detail-back">
          ← Credentials
        </Link>
        <ErrorState
          title="Could not load credential"
          message={error?.response?.data?.error || error?.message || 'Unknown error.'}
          onRetry={refetch}
        />
      </div>
    );
  }

  // ── Render full page ──────────────────────────────────────────
  const cred = data;
  const cand = cred.candidate || {};
  const asmt = cred.assessment || null;

  // Effective derived flags. Backend already provides isRevoked, but be lenient.
  const isRevoked = !!cred.isRevoked || !!cred.revoke || cred.status === 'revoked';

  return (
    <div className="detail-page">
      {/* Back link — pass activeCredentialId so list page highlights this row */}
      <button
        type="button"
        className="detail-back"
        onClick={() =>
          navigate('/credentials', { state: { activeCredentialId: cred.credentialId } })
        }
      >
        ← Credentials
      </button>

      {/* ── Section 1: Header ─────────────────────────────────── */}
      <div className="detail-card">
        <div className="detail-header-top">
          <div className="detail-cred-id">{cred.credentialId}</div>
          <StatusBadge status={cred.status || 'active'} />
        </div>

        <div className="detail-header-bottom">
          <div>
            <span className="meta-label">Issued</span>
            <span title={cred.issuedAt} style={{ color: 'var(--white)' }}>
              {cred.issuedAt ? timeAgo(cred.issuedAt) : '—'}
            </span>
          </div>

          {cred.tokenId != null && (
            <div>
              <span className="meta-label">Token ID</span>
              {cred.polygonscanUrl ? (
                <a
                  href={cred.polygonscanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on PolygonScan"
                >
                  #{cred.tokenId}
                  <span className="ext-icon" aria-hidden="true">↗</span>
                </a>
              ) : (
                <span style={{ color: 'var(--white)' }}>#{cred.tokenId}</span>
              )}
            </div>
          )}

          {cred.verifyUrl && (
            <div>
              <span className="meta-label">Public</span>
              <a
                href={cred.verifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // Alt-click copies link instead of opening
                  if (e.altKey) {
                    e.preventDefault();
                    navigator.clipboard?.writeText(cred.verifyUrl).then(() => {
                      setToast({ message: 'Verify link copied', type: 'success' });
                    });
                  }
                }}
                title="Open public verify page (Alt-click to copy link)"
              >
                Verify Page
                <span className="ext-icon" aria-hidden="true">↗</span>
              </a>
            </div>
          )}

          {!isRevoked && (
            <button
              type="button"
              className="detail-revoke-btn"
              onClick={() => setRevokeOpen(true)}
            >
              Revoke
            </button>
          )}
        </div>
      </div>

      {/* ── Section 2: Candidate ──────────────────────────────── */}
      <div className="detail-card">
        <div className="detail-section-label">Issued To</div>
        <h2 className="cand-name-big">{cand.name || '—'}</h2>
        {cand.email && <div className="cand-email-small">{cand.email}</div>}

        <div className="cand-meta-grid">
          {cand.walletAddress && (
            <>
              <div className="detail-field-label" style={{ marginBottom: 0 }}>
                Wallet
              </div>
              <div className="cand-wallet">
                <span title={cand.walletAddress}>
                  {truncateMiddle(cand.walletAddress, 18)}
                </span>
                <CopyButton text={cand.walletAddress} label="Copy" />
              </div>
            </>
          )}
          {cand.createdAt && (
            <>
              <div className="detail-field-label" style={{ marginBottom: 0 }}>
                Joined
              </div>
              <div title={cand.createdAt} style={{ color: 'var(--white)' }}>
                {timeAgo(cand.createdAt)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Section 3: Assessment ─────────────────────────────── */}
      {asmt && (
        <div className="detail-card">
          <div className="detail-section-label">Assessment Results</div>

          <div className="metric-grid">
            <MetricCell
              label="Score"
              value={
                asmt.percentage != null
                  ? `${asmt.percentage}%${asmt.score != null ? ` · ${asmt.score} pts` : ''}`
                  : '—'
              }
            />
            <MetricCell label="Tier" value={asmt.tier || '—'} tone="plain" />
            <MetricCell
              label="Completed"
              value={asmt.completedAt ? timeAgo(asmt.completedAt) : '—'}
              tone="plain"
            />
            <MetricCell
              label="Status"
              value={asmt.passed === true ? '✓ Pass' : asmt.passed === false ? '✗ Fail' : '—'}
              tone={asmt.passed === true ? 'pass' : asmt.passed === false ? 'fail' : 'plain'}
            />
          </div>

          <DimensionBreakdown dimScores={asmt.dimScores} />
        </div>
      )}

      {/* ── Section 4: Revocation (conditional) ───────────────── */}
      {cred.revoke && (
        <div className="revoke-block" role="alert">
          <div className="revoke-header">Revoked</div>
          <div className="revoke-meta">
            Revoked <strong title={cred.revoke.at}>{timeAgo(cred.revoke.at)}</strong>
            {cred.revoke.by && (
              <>
                {' '}by <strong>{cred.revoke.by}</strong>
              </>
            )}
          </div>
          {cred.revoke.reason && (
            <div className="revoke-reason">{cred.revoke.reason}</div>
          )}
        </div>
      )}

      {/* ── Section 5: Technical Details (collapsed) ──────────── */}
      <details className="tech-details">
        <summary>Technical Details</summary>
        <div className="tech-grid">
          <div className="detail-field-label" style={{ marginBottom: 0 }}>IPFS URI</div>
          <div className="tech-value">
            {cred.ipfsUri ? (
              <>
                <span>{cred.ipfsUri}</span>
                <CopyButton text={cred.ipfsUri} label="Copy" />
              </>
            ) : (
              <span className="tech-value-plain" style={{ color: 'var(--muted)' }}>—</span>
            )}
          </div>

          <div className="detail-field-label" style={{ marginBottom: 0 }}>Tx Hash</div>
          <div className="tech-value">
            {cred.txHash ? (
              <>
                <span>{cred.txHash}</span>
                <CopyButton text={cred.txHash} label="Copy" />
                {cred.polygonscanUrl && (
                  <a
                    href={cred.polygonscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--gold)',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.14em',
                      textDecoration: 'none',
                    }}
                  >
                    PolygonScan ↗
                  </a>
                )}
              </>
            ) : (
              <span className="tech-value-plain" style={{ color: 'var(--muted)' }}>—</span>
            )}
          </div>

          <div className="detail-field-label" style={{ marginBottom: 0 }}>PDF URL</div>
          <div className="tech-value tech-value-plain">
            {cred.pdfUrl ? (
              <a
                href={cred.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--gold)' }}
              >
                {cred.pdfUrl} ↗
              </a>
            ) : (
              <span style={{ color: 'var(--muted)' }}>—</span>
            )}
          </div>

          <div className="detail-field-label" style={{ marginBottom: 0 }}>Expires</div>
          <div className="tech-value tech-value-plain">{formatLongDate(cred.expiresAt)}</div>

          <div className="detail-field-label" style={{ marginBottom: 0 }}>Created</div>
          <div className="tech-value tech-value-plain">{formatLongDate(cred.createdAt)}</div>

          <div className="detail-field-label" style={{ marginBottom: 0 }}>Multilingual Tier</div>
          <div className="tech-value tech-value-plain">{cred.multilingualTier || '—'}</div>
        </div>
      </details>

      {/* ── Modal + Toast ─────────────────────────────────────── */}
      <RevokeModal
        credentialId={cred.credentialId}
        candidateName={cand.name}
        isOpen={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onComplete={handleRevokeComplete}
      />

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

function MetricCell({ label, value, tone }) {
  const numClass =
    'metric-num' +
    (tone === 'pass' ? ' metric-pass' : tone === 'fail' ? ' metric-fail' : tone === 'plain' ? ' metric-plain' : '');
  return (
    <div className="metric-cell">
      <div className="detail-field-label" style={{ marginBottom: 0 }}>{label}</div>
      <div className={numClass}>{value}</div>
    </div>
  );
}

function DimensionBreakdown({ dimScores }) {
  if (!dimScores || typeof dimScores !== 'object') return null;
  const entries = Object.entries(dimScores);
  if (entries.length === 0) return null;

  return (
    <div className="dim-list">
      {entries.map(([key, raw]) => {
        // dimScores values can be numbers (legacy) or { pct, correct, total }.
        const dim =
          typeof raw === 'object' && raw !== null
            ? { pct: raw.pct ?? 0, correct: raw.correct, total: raw.total }
            : { pct: Number(raw) || 0 };
        const pct = Math.max(0, Math.min(100, dim.pct));

        return (
          <div className="dim-row" key={key}>
            <span className="dim-name">{humanizeDimKey(key)}</span>
            <span className="dim-bar-track">
              <span className="dim-bar-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="dim-pct">{pct}%</span>
            <span className="dim-frac">
              {dim.correct != null && dim.total != null ? `${dim.correct}/${dim.total}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
