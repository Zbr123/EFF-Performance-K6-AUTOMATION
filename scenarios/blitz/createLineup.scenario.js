import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { createBlitzLineup, createBlitzLineupOk, lineupAlreadyExists } from '../../graphql/blitz.graphql.js';

export const id = 'createBlitzLineup';

export const steps = [
  { key: 'createBlitzLineup', label: 'createBlitzLineup' },
];

export function lineupTeamId(ctx) {
  const poolBlitz = (ctx.user && ctx.user.blitz) || {};
  if (ctx.data.blitzTeamCreated && ctx.data.blitzTeamId) return String(ctx.data.blitzTeamId);

  const leagueId = ctx.data.blitzLineupLeagueId ? String(ctx.data.blitzLineupLeagueId) : '';
  if (leagueId) {
    if (String(poolBlitz.joinedLeagueId || '') === leagueId && poolBlitz.joinedTeamId) {
      return String(poolBlitz.joinedTeamId);
    }
    if (String(poolBlitz.leagueId || '') === leagueId && poolBlitz.teamId) {
      return String(poolBlitz.teamId);
    }
    return '';
  }

  return String(poolBlitz.teamId || ctx.data.blitzTeamId || '');
}

export function stampLineupIds(ctx, teamId) {
  const usedTeam = String(teamId || '');
  const poolBlitz = (ctx.user && ctx.user.blitz) || {};
  const targetLeague = ctx.data.blitzLineupLeagueId ? String(ctx.data.blitzLineupLeagueId) : '';

  ctx.data.blitzTeamId = usedTeam;
  if (targetLeague) {
    ctx.data.blitzLeagueId = targetLeague;
    if (String(poolBlitz.joinedLeagueId || '') === targetLeague) {
      ctx.data.blitzJoinedLeagueId = targetLeague;
      ctx.data.blitzTeamName = poolBlitz.joinedTeamName || ctx.data.blitzTeamName || '';
    } else if (String(poolBlitz.leagueId || '') === targetLeague) {
      ctx.data.blitzTeamName = poolBlitz.teamName || ctx.data.blitzTeamName || '';
      ctx.data.blitzLeagueName = poolBlitz.leagueName || ctx.data.blitzLeagueName || '';
    }
  } else if (usedTeam && String(poolBlitz.teamId || '') === usedTeam) {
    ctx.data.blitzLeagueId = poolBlitz.leagueId || ctx.data.blitzLeagueId || '';
    ctx.data.blitzTeamName = poolBlitz.teamName || ctx.data.blitzTeamName || '';
    ctx.data.blitzLeagueName = poolBlitz.leagueName || ctx.data.blitzLeagueName || '';
  }
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = ctx.data.token;
  const teamId = lineupTeamId(ctx);

  if (!token) {
    throw new Error(
      'Scenario "createBlitzLineup" needs ctx.data.token. Put login or signup before it in the suite.'
    );
  }
  if (!teamId) {
    throw new Error(
      'Scenario "createBlitzLineup" needs the team in the target league (joinedTeamId) or the owned teamId.'
    );
  }

  if (ctx.data.blitzLineupLeagueId) {
    console.log(`[${flow.flowId}]     leagueId = ${ctx.data.blitzLineupLeagueId}`);
  }
  console.log(`[${flow.flowId}]     teamId = ${teamId}`);
  stampLineupIds(ctx, teamId);

  const createResp = createBlitzLineup(teamId, token, flow.flowId);
  if (lineupAlreadyExists(createResp)) {
    recordStep(flow, ctx.step('createBlitzLineup'), 'PASS', createResp);
    return true;
  }

  const okCreate = stepPassed(createResp, createBlitzLineupOk(createResp));
  if (okCreate) {
    const week = createResp.body.createBlitzLineup.Week;
    ctx.data.blitzLineupWeek = week == null ? '' : String(week);
  }
  recordStep(flow, ctx.step('createBlitzLineup'), okCreate ? 'PASS' : 'FAIL', createResp);

  return okCreate;
}
