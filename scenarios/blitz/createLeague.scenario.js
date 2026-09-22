import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { isTransientWriteFail, recordExtraStep, markFailRecovered } from '../../core/write.recover.js';
import { randomString } from '../../utils/random.util.js';
import {
  checkBlitzLeagueName,
  checkBlitzLeagueNameOk,
  createBlitzLeague,
  createBlitzLeagueOk,
  findBlitzLeagueByName,
  getBlitzLeagues,
  getBlitzLeaguesOk,
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
    ctx.data.blitzLeagueId = String(createResp.body.createBlitzLeague.League_ID);
    ctx.data.blitzLeagueName = leagueName;
    recordStep(flow, ctx.step('createBlitzLeague'), 'PASS', createResp);
    return true;
  }
  recordStep(flow, ctx.step('createBlitzLeague'), 'FAIL', createResp);
  if (!isTransientWriteFail(createResp)) return false;

  const listResp = getBlitzLeagues(token, flow.flowId);
  const found = findBlitzLeagueByName(listResp, leagueName);
  const verified = stepPassed(listResp, getBlitzLeaguesOk(listResp) && !!(found && found._id));
  recordExtraStep(
    flow,
    'getBlitzLeagues',
    verified ? 'PASS' : 'FAIL',
    listResp,
    verified ? '' : `league not found in getBlitzLeagues: ${leagueName}`
  );
  if (!verified) return false;
  ctx.data.blitzLeagueId = String(found._id);
  ctx.data.blitzLeagueName = leagueName;
  markFailRecovered(flow, ctx.step('createBlitzLeague').key);
  return true;
}
