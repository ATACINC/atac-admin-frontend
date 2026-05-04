const ACTION_LABELS = {
  login: 'Signed in',
  logout: 'Signed out',
  view_dashboard: 'Viewed dashboard',
  view_credential: 'Viewed credential',
  view_credentials: 'Viewed credentials',
  view_candidate: 'Viewed candidate',
  view_candidates: 'Viewed candidates',
  view_stuck_issues: 'Viewed stuck issues',
  view_employer_leads: 'Viewed employer leads',
  revoke_credential: 'Revoked credential',
  reissue_credential: 'Reissued credential',
  mark_employer_lead_contacted: 'Marked lead contacted',
  compare_credentials: 'Compared credentials',
  export_csv: 'Exported CSV',
};

const DESTRUCTIVE = new Set([
  'revoke_credential',
  'reissue_credential',
  'mark_employer_lead_contacted',
]);

const NEUTRAL = new Set(['login', 'logout']);

export function humanizeAction(action) {
  if (!action) return 'Unknown action';
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback: snake_case → Sentence case
  const spaced = String(action).replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function actionTone(action) {
  if (DESTRUCTIVE.has(action)) return 'destructive';
  if (NEUTRAL.has(action)) return 'neutral';
  return 'view';
}

const TARGET_LABELS = {
  credential: 'Credential',
  candidate: 'Candidate',
  employer_lead: 'Lead',
  assessment: 'Assessment',
  admin: 'Admin',
};

export function humanizeTargetType(type) {
  if (!type) return '';
  if (TARGET_LABELS[type]) return TARGET_LABELS[type];
  const spaced = String(type).replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ── Dimension keys ───────────────────────────────────────────────────────
// Explicit overrides for known assessment dimensions (current + legacy).
// Anything not in this map falls back to snake_case → Title Case.
const DIM_LABEL_OVERRIDES = {
  professionalism:   'Professionalism',
  communication:     'Communication',
  cx_operations:     'CX Operations',
  technology:        'Technology',
  compliance_safety: 'Compliance & Safety',
  remote_setup:      'Remote Setup',
  // Legacy keys (pre-Apr 2026)
  health_safety:     'Health & Safety',
  remote_work:       'Remote Work',
};

export function humanizeDimKey(key) {
  if (!key) return '';
  if (DIM_LABEL_OVERRIDES[key]) return DIM_LABEL_OVERRIDES[key];
  return String(key)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Stuck-issue type labels ──────────────────────────────────────────────
const STUCK_TYPE_LABELS = {
  failedMint:            'Failed Credential Mint',
  stuckAssessment:       'Stuck Assessment',
  emailBounce:           'Email Bounce',
  undeliveredCredential: 'Undelivered Credential',
};

export function humanizeStuckType(type) {
  if (!type) return 'Unknown Issue';
  if (STUCK_TYPE_LABELS[type]) return STUCK_TYPE_LABELS[type];
  // camelCase → spaced + Title Case
  const spaced = String(type).replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ── Note keys (camelCase → "Spaced Words") ───────────────────────────────
// Used for both stuck-issue notes panel and dashboard advisory notes.
export function humanizeNoteKey(k) {
  if (!k) return '';
  const spaced = String(k).replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
