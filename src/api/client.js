import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/admin';

const client = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default client;

// ── Auth ────────────────────────────────────────────────────────────────
export const apiLogin = (email, password) =>
  client.post('/auth/login', { email, password }).then((r) => r.data);

export const apiGetMe = () => client.get('/auth/me').then((r) => r.data);

// ── Dashboard ───────────────────────────────────────────────────────────
// Path is /dashboard/kpis (mounted under /api/admin), NOT /kpis.
export const apiGetKpis = () => client.get('/dashboard/kpis').then((r) => r.data);

export const apiGetActivity = (params = {}) =>
  client.get('/activity', { params }).then((r) => r.data);

// ── Credentials ─────────────────────────────────────────────────────────
export const apiGetCredentials = (params = {}) =>
  client.get('/credentials', { params }).then((r) => r.data);

export const apiGetCredential = (credentialId) =>
  client.get(`/credentials/${credentialId}`).then((r) => r.data);

export const apiRevokeCredential = (credentialId, reason) =>
  client
    .post(`/credentials/${credentialId}/revoke`, { reason })
    .then((r) => r.data);

// ── Candidates ──────────────────────────────────────────────────────────
export const apiGetCandidates = (params = {}) =>
  client.get('/candidates', { params }).then((r) => r.data);

export const apiGetCandidate = (candidateId) =>
  client.get(`/candidates/${candidateId}`).then((r) => r.data);

// ── Stuck issues ────────────────────────────────────────────────────────
export const apiGetStuckIssues = (params = {}) =>
  client.get('/stuck-issues', { params }).then((r) => r.data);

// ── Employer leads ──────────────────────────────────────────────────────
export const apiGetEmployerLeads = (params = {}) =>
  client.get('/employer-leads', { params }).then((r) => r.data);

export const apiMarkLeadContacted = (leadId) =>
  client.post(`/employer-leads/${leadId}/contacted`).then((r) => r.data);

// ── Assessment anomalies (Phase 6) ──────────────────────────────────────
export const apiGetAssessmentAnomalies = (params = {}) =>
  client.get('/assessments/anomalies', { params }).then((r) => r.data);

export const apiGetAssessmentTimings = (assessmentId) =>
  client.get(`/assessments/${assessmentId}/timings`).then((r) => r.data);

export const apiReviewAssessment = (assessmentId, note) =>
  client.post(`/assessments/${assessmentId}/review`, { note }).then((r) => r.data);

// ── Auth admin actions ──────────────────────────────────────────────────
export const apiResetCandidatePassword = (candidateEmail) =>
  client.post('/auth/reset-candidate-password', { candidateEmail }).then((r) => r.data);
