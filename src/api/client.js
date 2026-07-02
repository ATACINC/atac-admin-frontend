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

// ── Simulator ops (Sim-Ops Phase 2) ──────────────────────────────────────
// All three are POST with no body; the backend resolves the target session
// and cooldown server-side. Returned shapes:
//   clear-cooldown -> { cleared, alreadyClear }
//   reset-attempt  -> { reset, alreadyClear, priorStatus, scenarioCode, ageSeconds, createdAt }
//   force-retry    -> { cooldownCleared, attemptReset }
export const apiClearSimulatorCooldown = (candidateId) =>
  client.post(`/candidates/${candidateId}/simulator/clear-cooldown`).then((r) => r.data);

export const apiResetSimulatorAttempt = (candidateId) =>
  client.post(`/candidates/${candidateId}/simulator/reset-attempt`).then((r) => r.data);

export const apiForceSimulatorRetry = (candidateId) =>
  client.post(`/candidates/${candidateId}/simulator/force-retry`).then((r) => r.data);

// ── Candidate support tools (email edit / verification / archive) ─────────
// PATCH email { email } -> 200 { ok, candidate:{id,email,email_verified}, verification_sent, mx_warning? }
//   409 { code:'EMAIL_TAKEN', conflict:{id,name,email,email_verified,created_at} }
//   422 { code:'EMAIL_DOMAIN_INVALID', reason } · 400 EMAIL_SYNTAX|EMAIL_UNCHANGED · 404
export const apiUpdateCandidateEmail = (candidateId, email) =>
  client.patch(`/candidates/${candidateId}/email`, { email }).then((r) => r.data);

// POST resend-verification -> 200 { ok, sent } · 429 { code:'RATE_LIMITED', waitSeconds } · 400 ALREADY_VERIFIED
export const apiResendVerification = (candidateId) =>
  client.post(`/candidates/${candidateId}/resend-verification`).then((r) => r.data);

// POST archive { reason } -> 200 { ok, archived } · 409 { code:'HAS_ACTIVITY', activity } · 400 ALREADY_ARCHIVED
export const apiArchiveCandidate = (candidateId, reason) =>
  client.post(`/candidates/${candidateId}/archive`, { reason }).then((r) => r.data);

// POST unarchive -> 200 { ok, unarchived } · 400 NOT_ARCHIVED
export const apiUnarchiveCandidate = (candidateId) =>
  client.post(`/candidates/${candidateId}/unarchive`).then((r) => r.data);

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

// ── Feedback (Phase 2) ──────────────────────────────────────────────────
// List endpoint accepts optional source filter, wouldRecommend filter
// ('true' or 'false' string), plus limit/offset. Filter values of 'all'
// or undefined are excluded so the backend treats them as no-filter.
export const apiGetFeedbackList = (params = {}) => {
  const { source, wouldRecommend, limit = 50, offset = 0 } = params;
  const apiParams = { limit, offset };
  if (source && source !== 'all') apiParams.source = source;
  if (wouldRecommend === 'true' || wouldRecommend === 'false') {
    apiParams.wouldRecommend = wouldRecommend;
  }
  return client.get('/feedback/list', { params: apiParams }).then((r) => r.data);
};

export const apiGetFeedbackStats = () =>
  client.get('/feedback/stats').then((r) => r.data);

// ── Funnel + attribution (read-only) ─────────────────────────────────────
// GET /funnel[?since=ISO8601] -> { generated_at, window, funnel, recovery,
// clicks, click_conversions, welcome_sms }. `since` is the only server-side
// filter; omit it for all-time. No writes.
export const apiGetFunnel = (params = {}) => {
  const apiParams = {};
  if (params.since) apiParams.since = params.since;
  return client.get('/funnel', { params: apiParams }).then((r) => r.data);
};
