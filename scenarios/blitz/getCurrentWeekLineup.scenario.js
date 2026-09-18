import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import {
  blitzTeamsList,
  getBlitzTeams,
  getBlitzTeamsOk,
  getCurrentWeekBlitzLineup,
  getCurrentWeekBlitzLineupOk,
  pickBlitzTeam,
} from '../../graphql/blitz.graphql.js';
import { stampLineupIds } from './createLineup.scenario.js';

export const id = 'getCurrentWeekBlitzLineup';

export const steps = [
  { key: 'getBlitzTeams', label: 'getBlitzTeams' },
  { key: 'getCurrentWeekBlitzLineup', label: 'getCurrentWeekBlitzLineup' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const token = ctx.data.token;

  if (!token) {
    throw new Error(
      'Scenario "getCurrentWeekBlitzLineup" needs ctx.data.token. Put login or signup before it in the suite.'
    );
  }

  const poolBlitz = (ctx.user && ctx.user.blitz) || {};
  const targetLeague = ctx.data.blitzLineupLeagueId ? String(ctx.data.blitzLineupLeagueId) : '';
  if (targetLeague) console.log(`[${flow.flowId}]     target leagueId = ${targetLeague}`);

  const teamsResp = getBlitzTeams(token, flow.flowId);
  const teams = blitzTeamsList(teamsResp);
  const picked = pickBlitzTeam(teams, {
    targetLeagueId: targetLeague,
    ownedTeamId: poolBlitz.teamId || ctx.data.blitzTeamId || '',
    ownedLeagueId: poolBlitz.leagueId || ctx.data.blitzLeagueId || '',
  });
  const okTeams = stepPassed(teamsResp, getBlitzTeamsOk(teamsResp) && !!picked);
  recordStep(flow, ctx.step('getBlitzTeams'), okTeams ? 'PASS' : 'FAIL', teamsResp);
  if (!okTeams) {
    console.log(`[${flow.flowId}]     teams=${teams.length} picked=none`);
    return false;
  }

  stampLineupIds(ctx, picked._id);
  ctx.data.blitzTeamId = String(picked._id);
  ctx.data.blitzTeamName = picked.Team_Name || ctx.data.blitzTeamName || '';
  ctx.data.blitzLeagueId = String(picked.League_ID || ctx.data.blitzLeagueId || '');
  if (picked.league_details && picked.league_details.League_Name) {
    ctx.data.blitzLeagueName = picked.league_details.League_Name;
  }
  if (picked.Page_Context && picked.Page_Context.Current_Week != null) {
    ctx.data.blitzLineupWeek = String(picked.Page_Context.Current_Week);
  }
  console.log(`[${flow.flowId}]     teams=${teams.length} leagueId=${ctx.data.blitzLeagueId} teamId=${ctx.data.blitzTeamId}`);

  const resp = getCurrentWeekBlitzLineup(ctx.data.blitzTeamId, token, flow.flowId);
  const ok = stepPassed(resp, getCurrentWeekBlitzLineupOk(resp));
  if (ok) {
    const basic = resp.body.getCurrentWeekBlitzLineup.Basic;
    if (basic.Week != null) ctx.data.blitzLineupWeek = String(basic.Week);
    if (basic.Team_Name) ctx.data.blitzTeamName = String(basic.Team_Name);
    if (basic.League_ID) ctx.data.blitzLeagueId = String(basic.League_ID);
    if (basic.league_details && basic.league_details.League_Name) {
      ctx.data.blitzLeagueName = String(basic.league_details.League_Name);
    }
  }
  recordStep(flow, ctx.step('getCurrentWeekBlitzLineup'), ok ? 'PASS' : 'FAIL', resp);
  return ok;
}
