import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiLogin, apiGetMe } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token'));
  const [admin, setAdmin] = useState(() => {
    const raw = localStorage.getItem('admin_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!!localStorage.getItem('admin_token'));
  const navigate = useNavigate();

  // On mount: if we have a token, verify it via /auth/me
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoading(false);
      return;
    }
    apiGetMe()
      .then((data) => {
        if (cancelled) return;
        const adminUser = data.admin || data.user || data;
        setAdmin(adminUser);
        localStorage.setItem('admin_user', JSON.stringify(adminUser));
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        setToken(null);
        setAdmin(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    const newToken = data.token;
    const adminUser = data.admin || data.user || { email };
    if (!newToken) throw new Error('No token returned from server');
    localStorage.setItem('admin_token', newToken);
    localStorage.setItem('admin_user', JSON.stringify(adminUser));
    setToken(newToken);
    setAdmin(adminUser);
    return adminUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setToken(null);
    setAdmin(null);
    navigate('/login');
  }, [navigate]);

  const value = {
    token,
    admin,
    loading,
    isAuthenticated: !!token,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
