import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CredentialsListPage from './pages/CredentialsListPage';
import CredentialDetailPage from './pages/CredentialDetailPage';
import CandidatesListPage from './pages/CandidatesListPage';
import FeedbackPage from './pages/FeedbackPage';
import StuckIssuesPage from './pages/StuckIssuesPage';
import AssessmentAnomaliesPage from './pages/AssessmentAnomaliesPage';
import EmployerLeadsPage from './pages/EmployerLeadsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: 'var(--bg)',
        color: 'var(--white)',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 64, color: 'var(--gold)' }}>404</div>
      <div style={{ fontSize: 14, color: 'var(--muted)' }}>Page not found.</div>
      <a href="/dashboard" style={{ color: 'var(--gold)' }}>← Back to dashboard</a>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/credentials" element={<CredentialsListPage />} />
                <Route path="/credentials/:credentialId" element={<CredentialDetailPage />} />
                <Route path="/candidates" element={<CandidatesListPage />} />
                <Route path="/feedback" element={<FeedbackPage />} />
                <Route path="/stuck-issues" element={<StuckIssuesPage />} />
                <Route path="/assessments/anomalies" element={<AssessmentAnomaliesPage />} />
                <Route path="/employer-leads" element={<EmployerLeadsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
