import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { randomString } from '../../utils/random.util.js';
import {
  checkBlitzLeagueName,
  checkBlitzLeagueNameOk,
  createBlitzLeague,
  createBlitzLeagueOk,
} from '../../graphql/blitz.graphql.js';

export const id = 'createBlitzLeague';

export const steps = [
  { key: 'checkBlitzLeagueName', label: 'checkBlitzLeagueName' },
  { key: 'createBlitzLeague', label: 'createBlitzLeague' },
];

function makeLeagueName() {
  return `fw blitz ${Date.now()}${__VU}${__ITER}${randomString(3)}`.substring(0, 50);
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = ctx.data.token;

  if (!token) {
    throw new Error(
      'Scenario "createBlitzLeague" needs ctx.data.token. Put login or signup before it in the suite.'
    );
  }

  const leagueName = makeLeagueName();
  console.log(`[${flow.flowId}]     league name = ${leagueName}`);

  const checkResp = checkBlitzLeagueName(leagueName, token, flow.flowId);
  const okCheck = stepPassed(checkResp, checkBlitzLeagueNameOk(checkResp));
  recordStep(flow, ctx.step('checkBlitzLeagueName'), okCheck ? 'PASS' : 'FAIL', checkResp);
  if (!okCheck) return false;

  const createResp = createBlitzLeague(leagueName, token, flow.flowId);
  const okCreate = stepPassed(createResp, createBlitzLeagueOk(createResp));
  if (okCreate) {
    const leagueId = String(createResp.body.createBlitzLeague.League_ID);
    ctx.data.blitzLeagueId = leagueId;
    ctx.data.blitzLeagueName = leagueName;
  }
  recordStep(flow, ctx.step('createBlitzLeague'), okCreate ? 'PASS' : 'FAIL', createResp);

  return okCreate;
}
