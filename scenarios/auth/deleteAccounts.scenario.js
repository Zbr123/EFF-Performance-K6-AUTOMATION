import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { deleteUserAccountByEmail, deleteUserOk } from '../../graphql/auth.graphql.js';

export const id = 'deleteAccounts';

export const steps = [
  { key: 'deleteAccount', label: 'deleteUserAccountByEmail' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const { token, email } = ctx.data;

  if (!token || !email) {
    throw new Error(
      'Scenario "deleteAccounts" needs ctx.data.token and ctx.data.email. ' +
      'Put login or signup before it in the suite.'
    );
  }

  const deleteResp = deleteUserAccountByEmail(email, token, flow.flowId);
  const okDelete = stepPassed(deleteResp, deleteUserOk(deleteResp));
  recordStep(flow, ctx.step('deleteAccount'), okDelete ? 'PASS' : 'FAIL', deleteResp);

  if (okDelete) ctx.data.deleted = true;
  return okDelete;
}
