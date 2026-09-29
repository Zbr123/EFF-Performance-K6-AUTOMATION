import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireData, requireToken } from '../../utils/flow.util.js';
import {
  refreshTokenOk,
  refreshTokenSession,
  validateSession,
  validateTokenOk,
} from '../../graphql/auth.graphql.js';

export const id = 'refreshSession';

export const steps = [
  { key: 'validateBefore', label: 'validate (current session)' },
  { key: 'refreshToken', label: 'refreshToken' },
  { key: 'validateAfter', label: 'validate (rotated session)' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'refreshSession');
  const refreshToken = requireData(
    ctx,
    'refreshToken',
    'refreshSession',
    'ctx.data.refreshToken from login'
  );

  const beforeResp = validateSession(token, flow.flowId);
  const okBefore = stepPassed(beforeResp, validateTokenOk(beforeResp));
  recordStep(flow, ctx.step('validateBefore'), okBefore ? 'PASS' : 'FAIL', beforeResp);
  if (!okBefore) return false;

  const refreshResp = refreshTokenSession(refreshToken, flow.flowId);
  const okRefresh = stepPassed(refreshResp, refreshTokenOk(refreshResp));
  if (okRefresh) {
    const pair = refreshResp.body.refreshToken;
    ctx.data.token = String(pair.accessToken);
    ctx.data.refreshToken = String(pair.newRefreshToken);
  }
  recordStep(flow, ctx.step('refreshToken'), okRefresh ? 'PASS' : 'FAIL', refreshResp);
  if (!okRefresh) return false;

  const afterResp = validateSession(ctx.data.token, flow.flowId);
  const okAfter = stepPassed(afterResp, validateTokenOk(afterResp));
  recordStep(flow, ctx.step('validateAfter'), okAfter ? 'PASS' : 'FAIL', afterResp);
  return okAfter;
}
