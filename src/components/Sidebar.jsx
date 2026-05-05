import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/credentials', label: 'Credentials' },
  { to: '/candidates', label: 'Candidates' },
  { to: '/stuck-issues', label: 'Stuck Issues' },
  { to: '/assessments/anomalies', label: 'Anomalies' },
  { to: '/employer-leads', label: 'Employer Leads' },
];

export default function Sidebar() {
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: 'var(--bg-3)',
        borderRight: '1px solid var(--border-2)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      {/* Logo block */}
      <div
        style={{
          padding: '24px 22px 22px',
          borderBottom: '1px solid var(--border-2)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 400,
            color: 'var(--white)',
            lineHeight: 1.05,
            letterSpacing: '-0.005em',
          }}
        >
          ATAC <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>Global CX</span>
        </div>
        <div
          style={{
            fontSize: 9,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginTop: 6,
          }}
        >
          Admin Console
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '14px 0', flex: 1 }}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'block',
              padding: '11px 22px',
              fontSize: 12,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: isActive ? 'var(--gold)' : 'var(--muted)',
              borderLeft: `2px solid ${isActive ? 'var(--gold)' : 'transparent'}`,
              background: isActive ? 'rgba(201, 168, 76, 0.06)' : 'transparent',
              textDecoration: 'none',
              transition: 'color 0.15s, background 0.15s, border-color 0.15s',
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: '16px 22px',
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(238, 233, 223, 0.28)',
          borderTop: '1px solid var(--border-2)',
        }}
      >
        Phase 5 · Internal
      </div>
    </aside>
  );
}
