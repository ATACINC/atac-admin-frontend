// Phase 3 score-display helpers. Centralized so the DRAFT badge and the
// assessment-only detection are driven off a single source of truth.
// When the weighting is later locked, the version string changes away
// from "DRAFT-..." and isDraftWeighting() will return false everywhere
// the badge is mounted, no code change needed in the consuming views.

const PASS_THRESHOLD = 70;

// True when the combined weighting is still provisional. Drives the
// gold "DRAFT" pill in the candidates list and the "DRAFT WEIGHTING"
// banner in the credential detail.
export function isDraftWeighting(version) {
  return typeof version === 'string' && version.startsWith('DRAFT');
}

// True when this credential carries an assessment but no simulator
// score, so a combined value cannot be computed and must not be faked.
// Pioneers and pre-simulator legacy holders land here. Backend signals
// this two ways and we accept either:
//   1. combinedWeightingVersion ends with "-assessment-only"
//   2. simulatorScore is null (defensive fallback)
export function isAssessmentOnly(credential) {
  if (!credential) return false;
  if (typeof credential.combinedWeightingVersion === 'string'
      && credential.combinedWeightingVersion.endsWith('-assessment-only')) {
    return true;
  }
  if (credential.simulatorScore == null) return true;
  if (credential.combinedScore == null) return true;
  return false;
}

// Format a numeric score for display. Returns "--" for null/undefined
// rather than an em-dash so we never introduce a pre-existing brand
// violation into new code.
export function fmtScore(value, suffix = '') {
  if (value == null || Number.isNaN(value)) return '--';
  return `${value}${suffix}`;
}

// Pass/fail classification relative to the 70 threshold. Returns one
// of "pass" | "fail" | "unknown".
export function passClass(value) {
  if (value == null || Number.isNaN(value)) return 'unknown';
  return value >= PASS_THRESHOLD ? 'pass' : 'fail';
}

export { PASS_THRESHOLD };
