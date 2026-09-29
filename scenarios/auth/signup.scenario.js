import { EMAIL_DOMAIN, EMAIL_PREFIX, PASSWORD } from '../../config/env.config.js';
import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { applyLoginResult } from './login.scenario.js';
import { randomString } from '../../utils/random.util.js';
import {
  login,
  loginOk,
  setPassword,
  setPasswordOk,
  signUp,
  signupOk,
  verifyEmail,
  verifyEmailOk,
} from '../../graphql/auth.graphql.js';

export const id = 'signup';

export const steps = [
  { key: 'signUp', label: 'signUp' },
  { key: 'setPassword', label: 'setPassword' },
  { key: 'verifyEmail', label: 'verifyEmail (TEST_BYPASS)' },
  { key: 'login', label: 'login' },
];

function makeIdentity() {
  const unique = `${Date.now()}${__VU}${__ITER}${randomString(4)}`.toLowerCase();
  return {
    first_name: 'Load',
    last_name: 'Test',
    username: `fw_${unique}`.substring(0, 24),
    email: `${EMAIL_PREFIX}+fw_${unique}@${EMAIL_DOMAIN}`,
    dob: '2000-10-30',
    state: 'TX',
    heard_about_us: 'Other',
    profile_picture: 'icon_bear',
  };
}

export function run(ctx) {
  const flow = ctx.flow;
  const identity = makeIdentity();

  ctx.data.email = identity.email;
  ctx.data.username = identity.username;
  flow.email = identity.email;
  flow.username = identity.username;


  const signupResp = signUp(identity, flow.flowId);
  const okSignup = stepPassed(signupResp, signupOk(signupResp));
  recordStep(flow, ctx.step('signUp'), okSignup ? 'PASS' : 'FAIL', signupResp);
  if (!okSignup) return false;

  const resetKey = signupResp.body.signUp.temporarySignupKey;
  const setPwResp = setPassword(identity.email, resetKey, PASSWORD, flow.flowId);
  const okSetPw = stepPassed(setPwResp, setPasswordOk(setPwResp));
  recordStep(flow, ctx.step('setPassword'), okSetPw ? 'PASS' : 'FAIL', setPwResp);
  if (!okSetPw) return false;

  const verifyResp = verifyEmail(identity.email, flow.flowId);
  const okVerify = stepPassed(verifyResp, verifyEmailOk(verifyResp));
  recordStep(flow, ctx.step('verifyEmail'), okVerify ? 'PASS' : 'FAIL', verifyResp);
  if (!okVerify) return false;

  const loginResp = login(identity.email, PASSWORD, flow.flowId);
  const okLogin = stepPassed(loginResp, loginOk(loginResp));
  if (okLogin) applyLoginResult(ctx, loginResp);
  recordStep(flow, ctx.step('login'), okLogin ? 'PASS' : 'FAIL', loginResp);

  return okLogin;
}
