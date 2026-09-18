import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import {
  getLeagueResultsByWeek,
  getLeagueResultsByWeekOk,
  pickLeagueResultsWeek,
} from '../../graphql/blitz.graphql.js';

export const id = 'getLeagueResultsByWeek';

export const steps = [
  { key: 'getLeagueResultsByWeek', label: 'getLeagueResultsByWeek' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const token = ctx.data.token;
  const leagueId = ctx.data.blitzLeagueId ? String(ctx.data.blitzLeagueId) : '';
  const planned = ctx.step('getLeagueResultsByWeek');

  if (!token) {
    throw new Error(
      'Scenario "getLeagueResultsByWeek" needs ctx.data.token. Put login or signup before it in the suite.'
    );
  }
  if (!leagueId) {
    throw new Error(
      'Scenario "getLeagueResultsByWeek" needs ctx.data.blitzLeagueId from the target league (JOIN_HOST_EMAIL + JOIN_INVITE_CODE) or the owned league.'
    );
  }

  const week = pickLeagueResultsWeek({
    seasonType: ctx.data.effSeasonType,
    week: ctx.data.effWeek,
    seasonPhase: ctx.data.effSeasonPhase,
  });

  if (week == null) {
    recordStep(
      flow,
      planned,
      'SKIP',
      null,
      `no results week for SeasonType=${ctx.data.effSeasonType || '-'} Week=${ctx.data.effWeek || '-'} phase=${ctx.data.effSeasonPhase || '-'}`
    );
    return true;
  }

  console.log(`[${flow.flowId}]     leagueId=${leagueId} week=${week}`);
  ctx.data.blitzLineupWeek = String(week);

  const resp = getLeagueResultsByWeek(leagueId, week, token, flow.flowId);
  const ok = stepPassed(resp, getLeagueResultsByWeekOk(resp));
  if (ok) {
    const results = resp.body.getLeagueResultsByWeek.results;
    if (results.League_Name) ctx.data.blitzLeagueName = String(results.League_Name);
    if (results.Week != null) ctx.data.blitzLineupWeek = String(results.Week);
  }
  recordStep(flow, planned, ok ? 'PASS' : 'FAIL', resp);
  return ok;
}
