import { recordStep } from './flow.tracker.js';

export function gqlErrorCode(resp) {
  return (resp && resp.gqlErr && String(resp.gqlErr.errorCode || '')) || '';
}

export function isTransientWriteFail(resp) {
  if (!resp) return true;
  if (resp.is5xx) return true;
  const status = resp.res && resp.res.status;
  if (status === 0) return true;
  if (typeof status === 'number' && status >= 500) return true;
  const code = gqlErrorCode(resp);
  if (
    code === 'LAMBDA_TIMEOUT' ||
    code === 'INTERNAL_TIMEOUT' ||
    code === 'INTERNAL_ERROR' ||
    code === 'INVALID_JSON'
  ) {
    return true;
  }
  const msg = (resp.gqlErr && resp.gqlErr.message) || '';
  return /timed out|temporarily unavailable|please retry/i.test(msg);
}

export function recordExtraStep(flow, label, status, resp, skipReason) {
  recordStep(
    flow,
    {
      num: flow.steps.length + 1,
      key: `extra.${label}`,
      label: label,
    },
    status,
    resp,
    skipReason
  );
}

export function markFailRecovered(flow, planKey) {
  const want = String(planKey || '');
  for (let i = flow.steps.length - 1; i >= 0; i--) {
    const step = flow.steps[i];
    if (step.key === want && step.status === 'FAIL' && !step.recovered) {
      step.recovered = true;
      break;
    }
  }
}
