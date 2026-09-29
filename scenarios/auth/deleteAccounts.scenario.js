import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireData, requireToken } from '../../utils/flow.util.js';
import { deleteUserAccountByEmail, deleteUserOk } from '../../graphql/auth.graphql.js';

export const id = 'deleteAccounts';

export const steps = [
  { key: 'deleteAccount', label: 'deleteUserAccountByEmail' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'deleteAccounts');
  const email = requireData(ctx, 'email', 'deleteAccounts', 'ctx.data.email from login or signup');

  const deleteResp = deleteUserAccountByEmail(email, token, flow.flowId);
  const okDelete = stepPassed(deleteResp, deleteUserOk(deleteResp));
  recordStep(flow, ctx.step('deleteAccount'), okDelete ? 'PASS' : 'FAIL', deleteResp);

  if (okDelete) ctx.data.deleted = true;
  return okDelete;
}
