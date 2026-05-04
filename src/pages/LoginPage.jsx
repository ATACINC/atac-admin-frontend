import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // If we land here already authenticated (e.g., navigated back), bounce out
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const params = new URLSearchParams(location.search);
      const returnTo = params.get('returnTo');
      navigate(returnTo || '/dashboard', { replace: true });
    }
  }, [authLoading, isAuthenticated, location.search, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      const params = new URLSearchParams(location.search);
      const returnTo = params.get('returnTo');
      navigate(returnTo || '/dashboard', { replace: true });
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Sign in failed. Please try again.';
      setError(msg);
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(8, 11, 18, 0.6)',
    border: '1px solid var(--border-2)',
    borderRadius: 3,
    color: 'var(--white)',
    fontFamily: 'var(--font-body)',
    fontSize: 15,
    padding: '14px 16px',
    outline: 'none',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(900px 500px at 50% -10%, rgba(201,168,76,0.06), transparent 60%), var(--bg)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'linear-gradient(180deg, var(--bg-1) 0%, var(--bg-3) 100%)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '40px 40px 36px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
        }}
      >
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 400,
              color: 'var(--white)',
              lineHeight: 1.1,
            }}
          >
            ATAC <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>Global CX</span>
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginTop: 8,
            }}
          >
            Admin Console — Sign In
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 8,
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@atacglobalcx.com"
              autoComplete="email"
              autoFocus
              maxLength={254}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 8,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              role="alert"
              style={{
                margin: '4px 0 14px',
                padding: '10px 12px',
                background: 'rgba(196, 92, 92, 0.08)',
                border: '1px solid rgba(196, 92, 92, 0.32)',
                borderRadius: 3,
                color: 'var(--red)',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'var(--gold)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 3,
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.55 : 1,
              transition: 'opacity 0.15s, transform 0.15s',
            }}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div
          style={{
            marginTop: 22,
            paddingTop: 18,
            borderTop: '1px solid var(--border-2)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(238, 233, 223, 0.32)',
            textAlign: 'center',
          }}
        >
          Internal use only
        </div>
      </div>
    </div>
  );
}
