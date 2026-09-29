import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireToken } from '../../utils/flow.util.js';
import {
  getNFLPlayersForBlitzTeamByPosition,
  getNFLPlayersForBlitzTeamByPositionOk,
  getNFLTeamsForBlitzTeamByPosition,
  getNFLTeamsForBlitzTeamByPositionOk,
  selectablePlayerIds,
  selectableTeamIds,
  updateBlitzLineupByPosition,
  updateBlitzLineupByPositionOk,
} from '../../graphql/blitz.graphql.js';
import { lineupTeamId, stampLineupIds } from './createLineup.scenario.js';

export const id = 'updateBlitzLineup';

export const steps = [
  { key: 'getNFLPlayersQB', label: 'getNFLPlayersForBlitzTeamByPosition(QB)' },
  { key: 'updateQB', label: 'updateBlitzLineupByPosition(QB)' },
  { key: 'getNFLPlayersRB1', label: 'getNFLPlayersForBlitzTeamByPosition(RB1)' },
  { key: 'updateRB1', label: 'updateBlitzLineupByPosition(RB1)' },
  { key: 'getNFLPlayersRB2', label: 'getNFLPlayersForBlitzTeamByPosition(RB2)' },
  { key: 'updateRB2', label: 'updateBlitzLineupByPosition(RB2)' },
  { key: 'getNFLPlayersWR1', label: 'getNFLPlayersForBlitzTeamByPosition(WR1)' },
  { key: 'updateWR1', label: 'updateBlitzLineupByPosition(WR1)' },
  { key: 'getNFLPlayersWR2', label: 'getNFLPlayersForBlitzTeamByPosition(WR2)' },
  { key: 'updateWR2', label: 'updateBlitzLineupByPosition(WR2)' },
  { key: 'getNFLPlayersTE', label: 'getNFLPlayersForBlitzTeamByPosition(TE)' },
  { key: 'updateTE', label: 'updateBlitzLineupByPosition(TE)' },
  { key: 'getNFLTeamsK', label: 'getNFLTeamsForBlitzTeamByPosition(K)' },
  { key: 'updateK', label: 'updateBlitzLineupByPosition(K)' },
  { key: 'getNFLTeamsOFF', label: 'getNFLTeamsForBlitzTeamByPosition(OFF)' },
  { key: 'updateOFF', label: 'updateBlitzLineupByPosition(OFF)' },
  { key: 'getNFLTeamsDEF', label: 'getNFLTeamsForBlitzTeamByPosition(DEF)' },
  { key: 'updateDEF', label: 'updateBlitzLineupByPosition(DEF)' },
];

function pickDistinct(ids, count, salt, used) {
  const out = [];
  if (!ids || !ids.length || count < 1) return out;
  const start = Math.abs((__VU * 31 + __ITER * 17 + salt)) % ids.length;
  for (let i = 0; i < ids.length && out.length < count; i++) {
    const id = ids[(start + i) % ids.length];
    if (used[id]) continue;
    used[id] = true;
    out.push(id);
  }
  return out;
}

function playerDescription(resp, playerId) {
  const data = resp && resp.body && resp.body.getNFLPlayersForBlitzTeamByPosition;
  const rows = (data && data.players) || [];
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].Player_ID) !== String(playerId)) continue;
    const details = rows[i].Player_Details || {};
    const team = rows[i].Player_NFLTeam || {};
    const name = details.FullName || playerId;
    const teamName = team.ShortName || team.FullName || '';
    return teamName ? `${name} - ${playerId} - ${teamName}` : `${name} - ${playerId}`;
  }
  return String(playerId);
}

function teamDescription(resp, teamId) {
  const data = resp && resp.body && resp.body.getNFLTeamsForBlitzTeamByPosition;
  const rows = (data && data.teams) || [];
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].Team_ID) !== String(teamId)) continue;
    const details = rows[i].Team_Details || {};
    const name = details.FullName || teamId;
    const shortName = details.ShortName || '';
    return shortName ? `${name} - ${teamId} - ${shortName}` : `${name} - ${teamId}`;
  }
  return String(teamId);
}

function setLineupValue(ctx, position, value) {
  ctx.data[`blitzLineup${position}`] = value == null ? '' : String(value);
}

function skipUpdate(ctx, stepKey, reason, skipType) {
  recordStep(ctx.flow, ctx.step(stepKey), 'SKIP', null, reason, skipType);
}

function updateSlot(ctx, teamId, token, position, valueId, stepKey) {
  const resp = updateBlitzLineupByPosition(teamId, position, valueId, token, ctx.flow.flowId);
  const payload = resp.body && resp.body.updateBlitzLineupByPosition;
  const identityMatches = !!payload &&
    String(payload.Team_ID) === String(teamId) &&
    String(payload.Position).toUpperCase() === String(position).toUpperCase() &&
    String(payload.Value_ID) === String(valueId);
  const ok = stepPassed(resp, updateBlitzLineupByPositionOk(resp) && identityMatches);
  if (ok && payload.Week != null) {
    ctx.data.blitzLineupWeek = String(payload.Week);
  }
  recordStep(ctx.flow, ctx.step(stepKey), ok ? 'PASS' : 'FAIL', resp);
  return ok;
}

function fillPlayerSlot(ctx, teamId, token, catalogPosition, getKey, lineupPosition, updateKey, used, salt) {
  const resp = getNFLPlayersForBlitzTeamByPosition(teamId, catalogPosition, token, ctx.flow.flowId);
  const ids = selectablePlayerIds(resp);
  const okGet = stepPassed(resp, getNFLPlayersForBlitzTeamByPositionOk(resp) && ids.length >= 1);
  recordStep(ctx.flow, ctx.step(getKey), okGet ? 'PASS' : 'FAIL', resp);
  if (!okGet) {
    skipUpdate(
      ctx,
      updateKey,
      `skipped because getNFLPlayersForBlitzTeamByPosition(${lineupPosition}) failed`
    );
    return false;
  }
  const picked = pickDistinct(ids, 1, salt, used);
  if (!picked[0]) {
    skipUpdate(ctx, updateKey, `skipped because no unused selectable player for ${lineupPosition}`, 'business');
    return false;
  }
  setLineupValue(ctx, lineupPosition, playerDescription(resp, picked[0]));
  return updateSlot(ctx, teamId, token, lineupPosition, picked[0], updateKey);
}

function fillTeamSlot(ctx, teamId, token, catalogPosition, getKey, lineupPosition, updateKey, used, salt) {
  const resp = getNFLTeamsForBlitzTeamByPosition(teamId, catalogPosition, token, ctx.flow.flowId);
  const ids = selectableTeamIds(resp);
  const okGet = stepPassed(resp, getNFLTeamsForBlitzTeamByPositionOk(resp) && ids.length >= 1);
  recordStep(ctx.flow, ctx.step(getKey), okGet ? 'PASS' : 'FAIL', resp);
  if (!okGet) {
    skipUpdate(
      ctx,
      updateKey,
      `skipped because getNFLTeamsForBlitzTeamByPosition(${lineupPosition}) failed`
    );
    return false;
  }
  const picked = pickDistinct(ids, 1, salt, used);
  if (!picked[0]) {
    skipUpdate(ctx, updateKey, `skipped because no unused selectable NFL team for ${lineupPosition}`, 'business');
    return false;
  }
  setLineupValue(ctx, lineupPosition, teamDescription(resp, picked[0]));
  return updateSlot(ctx, teamId, token, lineupPosition, picked[0], updateKey);
}

export function run(ctx) {
  const token = requireToken(ctx, 'updateBlitzLineup');
  const teamId = lineupTeamId(ctx);

  if (!teamId) {
    throw new Error(
      'Scenario "updateBlitzLineup" needs the team in the target league (joinedTeamId) or the owned teamId.'
    );
  }

  if (ctx.data.blitzLineupLeagueId) {
  }
  stampLineupIds(ctx, teamId);

  const usedPlayers = {};
  const usedTeams = {};
  let allSlotsOk = true;
  const playerSlots = [
    ['QB', 'getNFLPlayersQB', 'QB', 'updateQB', 1],
    ['RB', 'getNFLPlayersRB1', 'RB1', 'updateRB1', 2],
    ['RB', 'getNFLPlayersRB2', 'RB2', 'updateRB2', 3],
    ['WR', 'getNFLPlayersWR1', 'WR1', 'updateWR1', 4],
    ['WR', 'getNFLPlayersWR2', 'WR2', 'updateWR2', 5],
    ['TE', 'getNFLPlayersTE', 'TE', 'updateTE', 6],
  ];
  const teamSlots = [
    ['K', 'getNFLTeamsK', 'K', 'updateK', 7],
    ['OFF', 'getNFLTeamsOFF', 'OFF', 'updateOFF', 8],
    ['DEF', 'getNFLTeamsDEF', 'DEF', 'updateDEF', 9],
  ];

  for (let i = 0; i < playerSlots.length; i++) {
    const slot = playerSlots[i];
    if (!fillPlayerSlot(ctx, teamId, token, slot[0], slot[1], slot[2], slot[3], usedPlayers, slot[4])) {
      allSlotsOk = false;
    }
  }
  for (let i = 0; i < teamSlots.length; i++) {
    const slot = teamSlots[i];
    if (!fillTeamSlot(ctx, teamId, token, slot[0], slot[1], slot[2], slot[3], usedTeams, slot[4])) {
      allSlotsOk = false;
    }
  }

  return allSlotsOk;
}
