import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireData, requireToken, textValue } from '../../utils/flow.util.js';
import {
  getExchangeLeague,
  getExchangeLeagueDetails,
  getExchangeLeagueDetailsOk,
  getExchangeLeagueOk,
  pickExchangeDetailsOwnTeam,
  pickExchangeDetailsTopTeam,
  pickExchangeLeague,
} from '../../graphql/exchange.graphql.js';

export const id = 'getExchangeLeagueDetails';

export const steps = [
  { key: 'getExchangeLeague', label: 'getExchangeLeague' },
  { key: 'getExchangeLeagueDetails', label: 'getExchangeLeagueDetails' },
];

const NOT_STARTED_CODES = ['LEAGUE_VIEW_NOT_STARTED', 'SEASON_NOT_STARTED', 'LEAGUE_STANDINGS_NOT_AVAILABLE'];

function isNotStarted(resp) {
  const code = resp && resp.gqlErr && resp.gqlErr.errorCode;
  return !!code && NOT_STARTED_CODES.indexOf(String(code).toUpperCase()) >= 0;
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'getExchangeLeagueDetails');
  const leagueId = requireData(
    ctx,
    'exchangeLeagueId',
    'getExchangeLeagueDetails',
    'ctx.data.exchangeLeagueId from createExchangeLeague, join, or the pool'
  );
  const teamId = ctx.data.exchangeTeamId ? String(ctx.data.exchangeTeamId) : '';

  const leagueResp = getExchangeLeague(leagueId, token, flow.flowId);
  const picked = pickExchangeLeague(leagueResp, leagueId);
  const okLeague = stepPassed(
    leagueResp,
    getExchangeLeagueOk(leagueResp) && !!picked && String(picked._id) === String(leagueId)
  );
  recordStep(flow, ctx.step('getExchangeLeague'), okLeague ? 'PASS' : 'FAIL', leagueResp);
  if (!okLeague) return false;

  ctx.data.exchangeLeagueName = String(picked.League_Name || '');
  ctx.data.exchangeDetailsLeagueMembers = textValue(picked.Members);

  const detailsResp = getExchangeLeagueDetails(leagueId, token, flow.flowId);
  const details = detailsResp.body && detailsResp.body.getExchangeLeagueDetails
    ? detailsResp.body.getExchangeLeagueDetails.details
    : null;
  const okDetails = stepPassed(
    detailsResp,
    getExchangeLeagueDetailsOk(detailsResp) && !!details && String(details.League_ID) === String(leagueId)
  );
  if (okDetails) {
    const teams = Array.isArray(details.Teams) ? details.Teams : [];
    const top = pickExchangeDetailsTopTeam(detailsResp);
    const own = teamId ? pickExchangeDetailsOwnTeam(detailsResp, teamId) : null;
    ctx.data.exchangeDetailsTeamCount = textValue(teams.length);
    ctx.data.exchangeDetailsTopTeam = top
      ? `${top.Team_Name || top.Team_ID} - ${top.Portfolio_Value}`
      : '';
    ctx.data.exchangeDetailsOwnRank = own ? textValue(own.Rank) : '';
    recordStep(flow, ctx.step('getExchangeLeagueDetails'), 'PASS', detailsResp);
    return true;
  }

  if (isNotStarted(detailsResp)) {
    recordStep(flow, ctx.step('getExchangeLeagueDetails'), 'SKIP', detailsResp, 'Exchange standings are not available for the current timeframe', 'business');
    return true;
  }
  recordStep(flow, ctx.step('getExchangeLeagueDetails'), 'FAIL', detailsResp);
  return false;
}
