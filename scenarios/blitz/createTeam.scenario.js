import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { randomString } from '../../utils/random.util.js';
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

function makeTeamName() {
  return `fw team ${Date.now()}${__VU}${__ITER}${randomString(3)}`.substring(0, 50);
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = ctx.data.token;
  const leagueId = ctx.data.blitzLeagueId ? String(ctx.data.blitzLeagueId) : '';

  if (!token) {
    throw new Error(
      'Scenario "createBlitzTeam" needs ctx.data.token. Put login or signup before it in the suite.'
    );
  }
  if (!leagueId) {
    throw new Error('Scenario "createBlitzTeam" needs ctx.data.blitzLeagueId from createBlitzLeague, join, or the pool.');
  }

  const teamName = makeTeamName();
  console.log(`[${flow.flowId}]     leagueId = ${leagueId}`);
  console.log(`[${flow.flowId}]     team name = ${teamName}`);

  const checkResp = checkBlitzTeamName(leagueId, teamName, token, flow.flowId);
  const okCheck = stepPassed(checkResp, checkBlitzTeamNameOk(checkResp));
  recordStep(flow, ctx.step('checkBlitzTeamName'), okCheck ? 'PASS' : 'FAIL', checkResp);
  if (!okCheck) return false;

  const createResp = createBlitzTeam(leagueId, teamName, token, flow.flowId);
  const okCreate = stepPassed(createResp, createBlitzTeamOk(createResp));
  if (okCreate) {
    ctx.data.blitzTeamId = String(createResp.body.createBlitzTeam.Team_ID);
    ctx.data.blitzTeamName = teamName;
    ctx.data.blitzTeamCreated = true;
  }
  recordStep(flow, ctx.step('createBlitzTeam'), okCreate ? 'PASS' : 'FAIL', createResp);

  return okCreate;
}
