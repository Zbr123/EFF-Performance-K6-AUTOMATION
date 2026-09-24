import { recordStep, stepPassed } from '../../core/flow.tracker.js';
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
  const token = ctx.data.token;
  const inviteCode = ctx.data.blitzInviteCode;

  if (!token) {
    throw new Error(
      'Scenario "joinPrivateBlitzLeague" needs ctx.data.token. Put login or signup before it in the suite.'
    );
  }
  if (!inviteCode) {
    throw new Error('Scenario "joinPrivateBlitzLeague" needs ctx.data.blitzInviteCode from setup (host invite).');
  }

  console.log(`[${flow.flowId}]     inviteCode = ${inviteCode}`);

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
