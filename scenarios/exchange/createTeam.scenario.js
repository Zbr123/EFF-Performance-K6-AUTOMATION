import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireData, requireToken, uniqueTestName } from '../../utils/flow.util.js';
import {
  checkExchangeTeamName,
  checkExchangeTeamNameOk,
  createExchangeTeam,
  createExchangeTeamOk,
} from '../../graphql/exchange.graphql.js';

export const id = 'createExchangeTeam';

export const steps = [
  { key: 'checkExchangeTeamName', label: 'checkExchangeTeamName' },
  { key: 'createExchangeTeam', label: 'createExchangeTeam' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'createExchangeTeam');
  const leagueId = requireData(
    ctx,
    'exchangeLeagueId',
    'createExchangeTeam',
    'ctx.data.exchangeLeagueId from createExchangeLeague or the pool'
  );

  const teamName = uniqueTestName('fw exchange team');

  const checkResp = checkExchangeTeamName(leagueId, teamName, token, flow.flowId);
  const okCheck = stepPassed(checkResp, checkExchangeTeamNameOk(checkResp));
  recordStep(flow, ctx.step('checkExchangeTeamName'), okCheck ? 'PASS' : 'FAIL', checkResp);
  if (!okCheck) return false;

  const createResp = createExchangeTeam(leagueId, teamName, token, flow.flowId);
  const okCreate = stepPassed(createResp, createExchangeTeamOk(createResp));
  if (okCreate) {
    const teamId = String(createResp.body.createExchangeTeam.Team_ID);
    const isJoinedLeague = !!(
      ctx.data.exchangeJoinedLeagueId &&
      String(ctx.data.exchangeJoinedLeagueId) === leagueId
    );
    if (isJoinedLeague) {
      ctx.data.exchangeJoinedTeamId = teamId;
      ctx.data.exchangeJoinedTeamName = teamName;
    } else {
      ctx.data.exchangeTeamId = teamId;
      ctx.data.exchangeTeamName = teamName;
    }
    ctx.data.exchangeTeamCreated = true;
  }
  recordStep(flow, ctx.step('createExchangeTeam'), okCreate ? 'PASS' : 'FAIL', createResp);

  return okCreate;
}
