import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireData, requireToken } from '../../utils/flow.util.js';
import {
  joinPrivateBlitzLeague,
  joinPrivateBlitzLeagueOk,
} from '../../graphql/blitz.graphql.js';

export const id = 'joinPrivateBlitzLeague';

export const steps = [
  { key: 'joinPrivateBlitzLeague', label: 'joinPrivateBlitzLeague' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'joinPrivateBlitzLeague');
  const inviteCode = requireData(
    ctx,
    'blitzInviteCode',
    'joinPrivateBlitzLeague',
    'ctx.data.blitzInviteCode from setup (host invite)'
  );


  const joinResp = joinPrivateBlitzLeague(inviteCode, token, flow.flowId);
  const okJoin = stepPassed(joinResp, joinPrivateBlitzLeagueOk(joinResp));
  if (okJoin) {
    const leagueId = String(joinResp.body.joinPrivateBlitzLeague.League_ID);
    ctx.data.blitzJoinedLeagueId = leagueId;
    ctx.data.blitzLeagueId = leagueId;
  }
  recordStep(flow, ctx.step('joinPrivateBlitzLeague'), okJoin ? 'PASS' : 'FAIL', joinResp);

  return okJoin;
}
