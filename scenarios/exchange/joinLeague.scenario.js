import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireData, requireToken } from '../../utils/flow.util.js';
import {
  joinPrivateExchangeLeague,
  joinPrivateExchangeLeagueOk,
} from '../../graphql/exchange.graphql.js';

export const id = 'joinPrivateExchangeLeague';

export const steps = [
  { key: 'joinPrivateExchangeLeague', label: 'joinPrivateExchangeLeague' },
];

function alreadyMember(resp) {
  return !!(resp && resp.gqlErr && resp.gqlErr.errorCode === 'LEAGUE_MEMBERSHIP_ALREADY_EXISTS');
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'joinPrivateExchangeLeague');
  const inviteCode = requireData(
    ctx,
    'exchangeInviteCode',
    'joinPrivateExchangeLeague',
    'ctx.data.exchangeInviteCode from Exchange host setup'
  );
  const targetLeagueId = ctx.data.exchangeTargetLeagueId ? String(ctx.data.exchangeTargetLeagueId) : '';


  const resp = joinPrivateExchangeLeague(inviteCode, token, flow.flowId);
  if (alreadyMember(resp)) {
    if (!targetLeagueId) {
      recordStep(
        flow,
        ctx.step('joinPrivateExchangeLeague'),
        'FAIL',
        resp,
        'already a member, but the target Exchange League_ID could not be resolved; provide JOIN_HOST_EMAIL as well as JOIN_INVITE_CODE'
      );
      return false;
    }
    ctx.data.exchangeJoinedLeagueId = targetLeagueId;
    ctx.data.exchangeLeagueId = targetLeagueId;
    recordStep(flow, ctx.step('joinPrivateExchangeLeague'), 'PASS', resp);
    return true;
  }

  const ok = stepPassed(resp, joinPrivateExchangeLeagueOk(resp));
  if (ok) {
    const leagueId = String(resp.body.joinPrivateExchangeLeague.League_ID);
    ctx.data.exchangeJoinedLeagueId = leagueId;
    ctx.data.exchangeLeagueId = leagueId;
  }
  recordStep(flow, ctx.step('joinPrivateExchangeLeague'), ok ? 'PASS' : 'FAIL', resp);
  return ok;
}
