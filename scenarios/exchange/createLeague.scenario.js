import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { isTransientWriteFail, recordExtraStep, markFailRecovered } from '../../core/write.recover.js';
import { requireToken, uniqueTestName } from '../../utils/flow.util.js';
import {
  checkExchangeLeagueName,
  checkExchangeLeagueNameOk,
  createExchangeLeague,
  createExchangeLeagueOk,
  findExchangeLeagueByName,
  getExchangeLeagues,
  getExchangeLeaguesOk,
} from '../../graphql/exchange.graphql.js';

export const id = 'createExchangeLeague';

export const steps = [
  { key: 'checkExchangeLeagueName', label: 'checkExchangeLeagueName' },
  { key: 'createExchangeLeague', label: 'createExchangeLeague' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'createExchangeLeague');

  const leagueName = uniqueTestName('fw exchange');

  const checkResp = checkExchangeLeagueName(leagueName, token, flow.flowId);
  const okCheck = stepPassed(checkResp, checkExchangeLeagueNameOk(checkResp));
  recordStep(flow, ctx.step('checkExchangeLeagueName'), okCheck ? 'PASS' : 'FAIL', checkResp);
  if (!okCheck) return false;

  const createResp = createExchangeLeague(leagueName, token, flow.flowId);
  const okCreate = stepPassed(createResp, createExchangeLeagueOk(createResp));
  if (okCreate) {
    ctx.data.exchangeLeagueId = String(createResp.body.createExchangeLeague.League_ID);
    ctx.data.exchangeLeagueName = leagueName;
    recordStep(flow, ctx.step('createExchangeLeague'), 'PASS', createResp);
    return true;
  }

  recordStep(flow, ctx.step('createExchangeLeague'), 'FAIL', createResp);
  if (!isTransientWriteFail(createResp)) return false;

  const listResp = getExchangeLeagues(token, flow.flowId);
  const found = findExchangeLeagueByName(listResp, leagueName);
  const verified = stepPassed(listResp, getExchangeLeaguesOk(listResp) && !!(found && found._id));
  recordExtraStep(
    flow,
    'getExchangeLeagues',
    verified ? 'PASS' : 'FAIL',
    listResp,
    verified ? '' : `exchange league not found in getExchangeLeagues: ${leagueName}`
  );
  if (!verified) return false;

  ctx.data.exchangeLeagueId = String(found._id);
  ctx.data.exchangeLeagueName = leagueName;
  markFailRecovered(flow, ctx.step('createExchangeLeague').key);
  return true;
}
