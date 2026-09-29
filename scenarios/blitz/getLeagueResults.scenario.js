import { recordBusinessRule, recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireData, requireToken, textValue } from '../../utils/flow.util.js';
import { describeRankedTeam, timeframeData, timeframeText } from './getLeagueDetails.scenario.js';
import {
  getLeagueResultsByWeek,
  getLeagueResultsByWeekOk,
  isPreseasonTimeframe,
  pickLeagueResultsWeek,
} from '../../graphql/blitz.graphql.js';

export const id = 'getLeagueResultsByWeek';

export const steps = [
  { key: 'getLeagueResultsByWeek', label: 'getLeagueResultsByWeek' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'getLeagueResultsByWeek');
  const leagueId = requireData(
    ctx,
    'blitzLeagueId',
    'getLeagueResultsByWeek',
    'ctx.data.blitzLeagueId from the target league or the owned league'
  );
  const planned = ctx.step('getLeagueResultsByWeek');

  const timeframe = timeframeData(ctx);
  const week = pickLeagueResultsWeek(timeframe);

  if (week == null) {
    if (isPreseasonTimeframe(timeframe)) {
      recordBusinessRule(
        flow,
        planned,
        'PRESEASON_NO_RESULTS',
        `Preseason has no matches; weekly results unavailable (${timeframeText(timeframe)})`
      );
      return true;
    }
    recordStep(
      flow,
      planned,
      'SKIP',
      null,
      `no results week for ${timeframeText(timeframe)}`,
      'business'
    );
    return true;
  }

  ctx.data.blitzLineupWeek = String(week);

  const resp = getLeagueResultsByWeek(leagueId, week, token, flow.flowId);
  const results = (resp.body && resp.body.getLeagueResultsByWeek && resp.body.getLeagueResultsByWeek.results) || {};
  const identityMatches = results.League_ID != null &&
    String(results.League_ID) === String(leagueId) &&
    results.Week != null &&
    String(results.Week) === String(week);
  const ok = stepPassed(resp, getLeagueResultsByWeekOk(resp) && identityMatches);
  if (ok) {
    const teams = Array.isArray(results.Teams) ? results.Teams : [];
    if (results.League_Name) ctx.data.blitzLeagueName = String(results.League_Name);
    if (results.Week != null) ctx.data.blitzLineupWeek = String(results.Week);
    ctx.data.blitzResultsTeamCount = textValue(teams.length);
    ctx.data.blitzResultsLeader = describeRankedTeam(teams[0], 'Total_Week_Points');
    for (let i = 0; i < teams.length; i++) {
      if (String(teams[i].Team_ID) !== String(ctx.data.blitzTeamId)) continue;
      ctx.data.blitzResultsOwnRank = textValue(teams[i].Rank);
      ctx.data.blitzResultsOwnPoints = textValue(teams[i].Total_Week_Points);
      break;
    }
  }
  recordStep(flow, planned, ok ? 'PASS' : 'FAIL', resp);
  return ok;
}
