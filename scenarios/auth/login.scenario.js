import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { login, loginOk } from '../../graphql/auth.graphql.js';

export const id = 'login';

export const steps = [
  { key: 'login', label: 'login' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const user = ctx.user;

  const loginResp = login(user.email, ctx.password, flow.flowId);
  const okLogin = stepPassed(loginResp, loginOk(loginResp));

  if (okLogin) {
    ctx.data.token = loginResp.body.login.accessToken;
    ctx.data.email = user.email;
    ctx.data.username = user.username || ctx.data.username;
    ctx.data.userId =
      (loginResp.body.login.user && loginResp.body.login.user._id) || ctx.data.userId;
  }

  recordStep(flow, ctx.step('login'), okLogin ? 'PASS' : 'FAIL', loginResp);
  return okLogin;
}
