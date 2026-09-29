import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireToken, textValue } from '../../utils/flow.util.js';
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

function describeViewSlot(slot) {
  if (!slot) return '';
  const player = slot.Player_Details || {};
  const team = slot.Team || slot.Team_Details || {};
  const name = player.FullName || '';
  const teamName = team.ShortName || team.FullName || '';
  const points = slot.Points == null ? '' : String(slot.Points);
  const parts = [slot.LineupPosition || '', name || '-', teamName || '-'];
  if (points) parts.push(`${points} pts`);
  return parts.filter((part) => part !== '').join(' - ');
}

function setViewSlot(ctx, position, slot) {
  ctx.data[`blitzLineup${position}`] = describeViewSlot(slot);
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'getCurrentWeekBlitzLineup');

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
    return false;
  }

  stampLineupIds(ctx, picked._id);
  ctx.data.blitzTeamId = String(picked._id);
  ctx.data.blitzTeamName = picked.Team_Name || ctx.data.blitzTeamName || '';
  if (picked.Lineup_Status) ctx.data.blitzLineupStatus = String(picked.Lineup_Status);
  ctx.data.blitzLeagueId = String(picked.League_ID || ctx.data.blitzLeagueId || '');
  if (picked.league_details && picked.league_details.League_Name) {
    ctx.data.blitzLeagueName = picked.league_details.League_Name;
  }
  if (picked.Page_Context && picked.Page_Context.Current_Week != null) {
    ctx.data.blitzLineupWeek = String(picked.Page_Context.Current_Week);
  }

  const resp = getCurrentWeekBlitzLineup(ctx.data.blitzTeamId, token, flow.flowId);
  const result = resp.body && resp.body.getCurrentWeekBlitzLineup;
  const basic = (result && result.Basic) || {};
  const teamMatches = basic.Team_ID != null && String(basic.Team_ID) === String(ctx.data.blitzTeamId);
  const ok = stepPassed(resp, getCurrentWeekBlitzLineupOk(resp) && teamMatches);
  if (ok) {
    if (basic.Week != null) ctx.data.blitzLineupWeek = textValue(basic.Week);
    if (basic.Team_Name) ctx.data.blitzTeamName = String(basic.Team_Name);
    if (basic.League_ID) ctx.data.blitzLeagueId = String(basic.League_ID);
    if (basic.Lineup_Status) ctx.data.blitzLineupStatus = String(basic.Lineup_Status);
    if (basic.Total_Week_Points != null) ctx.data.blitzLineupTotalWeekPoints = textValue(basic.Total_Week_Points);
    if (basic.Total_Season_Points != null) ctx.data.blitzLineupTotalSeasonPoints = textValue(basic.Total_Season_Points);
    if (basic.Rank != null) ctx.data.blitzLineupRank = textValue(basic.Rank);
    if (basic.league_details) {
      if (basic.league_details.League_Name) ctx.data.blitzLeagueName = String(basic.league_details.League_Name);
      if (basic.league_details.Members != null) ctx.data.blitzLeagueMembers = textValue(basic.league_details.Members);
    }

    const lineup = result.Lineup || {};
    const players = lineup.Players || {};
    const teams = lineup.Teams || {};
    setViewSlot(ctx, 'QB', players.Quarterback);
    setViewSlot(ctx, 'RB1', players.Running_Back1);
    setViewSlot(ctx, 'RB2', players.Running_Back2);
    setViewSlot(ctx, 'WR1', players.Wide_Receiver1);
    setViewSlot(ctx, 'WR2', players.Wide_Receiver2);
    setViewSlot(ctx, 'TE', players.Tight_End);
    setViewSlot(ctx, 'K', teams.Kicker);
    setViewSlot(ctx, 'OFF', teams.Offense);
    setViewSlot(ctx, 'DEF', teams.Defense);
  }
  recordStep(flow, ctx.step('getCurrentWeekBlitzLineup'), ok ? 'PASS' : 'FAIL', resp);
  return ok;
}
