import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireData, requireToken, uniqueTestName } from '../../utils/flow.util.js';
import {
  checkBlitzTeamName,
  checkBlitzTeamNameOk,
  createBlitzTeam,
  createBlitzTeamOk,
} from '../../graphql/blitz.graphql.js';

export const id = 'createBlitzTeam';

export const steps = [
  { key: 'checkBlitzTeamName', label: 'checkBlitzTeamName' },
  { key: 'createBlitzTeam', label: 'createBlitzTeam' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'createBlitzTeam');
  const leagueId = requireData(
    ctx,
    'blitzLeagueId',
    'createBlitzTeam',
    'ctx.data.blitzLeagueId from createBlitzLeague, join, or the pool'
  );

  const teamName = uniqueTestName('fw team');

  const checkResp = checkBlitzTeamName(leagueId, teamName, token, flow.flowId);
  const okCheck = stepPassed(checkResp, checkBlitzTeamNameOk(checkResp));
  recordStep(flow, ctx.step('checkBlitzTeamName'), okCheck ? 'PASS' : 'FAIL', checkResp);
  if (!okCheck) return false;

  const createResp = createBlitzTeam(leagueId, teamName, token, flow.flowId);
  const okCreate = stepPassed(createResp, createBlitzTeamOk(createResp));
  if (okCreate) {
    const teamId = String(createResp.body.createBlitzTeam.Team_ID);
    const isJoinedLeague = !!(
      ctx.data.blitzJoinedLeagueId &&
      String(ctx.data.blitzJoinedLeagueId) === leagueId
    );
    if (isJoinedLeague) {
      ctx.data.blitzJoinedTeamId = teamId;
      ctx.data.blitzJoinedTeamName = teamName;
    } else {
      ctx.data.blitzTeamId = teamId;
      ctx.data.blitzTeamName = teamName;
    }
    ctx.data.blitzTeamCreated = true;
  }
  recordStep(flow, ctx.step('createBlitzTeam'), okCreate ? 'PASS' : 'FAIL', createResp);

  return okCreate;
}
