import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requirePoolUser } from '../../utils/flow.util.js';
import { login, loginOk } from '../../graphql/auth.graphql.js';

export const id = 'login';

export const steps = [
  { key: 'login', label: 'login' },
];

export function applyLoginResult(ctx, response) {
  const payload = response && response.body && response.body.login;
  if (!payload || !payload.accessToken) return false;

  ctx.data.token = payload.accessToken;
  if (payload.refreshToken) ctx.data.refreshToken = payload.refreshToken;
  ctx.data.email = payload.email || ctx.data.email || '';
  ctx.data.username = (payload.user && payload.user.username) || ctx.data.username || '';
  ctx.data.userId = (payload.user && payload.user._id) || ctx.data.userId || '';
  return true;
}

export function run(ctx) {
  const flow = ctx.flow;
  const user = requirePoolUser(ctx, 'login');

  const loginResp = login(user.email, ctx.password, flow.flowId);
  const okLogin = stepPassed(loginResp, loginOk(loginResp));

  if (okLogin) applyLoginResult(ctx, loginResp);

  recordStep(flow, ctx.step('login'), okLogin ? 'PASS' : 'FAIL', loginResp);
  return okLogin;
}
