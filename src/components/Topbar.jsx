import { useAuth } from '../auth/AuthContext';

export default function Topbar() {
  const { admin, logout } = useAuth();
  const email = admin?.email || 'admin';

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        background: 'var(--bg-3)',
        borderBottom: '1px solid var(--border-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 14,
        padding: '0 24px',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Signed in as <span style={{ color: 'var(--white)' }}>{email}</span>
      </div>
      <button
        type="button"
        onClick={logout}
        style={{
          background: 'transparent',
          color: 'var(--muted)',
          border: '1px solid var(--border-2)',
          borderRadius: 2,
          padding: '7px 14px',
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        Sign Out
      </button>
    </header>
  );
}
