import { recordStep, stepPassed } from '../../core/flow.tracker.js';
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

function skipUpdate(ctx, stepKey, reason) {
  recordStep(ctx.flow, ctx.step(stepKey), 'SKIP', null, reason);
}

function updateSlot(ctx, teamId, token, position, valueId, stepKey) {
  console.log(`[${ctx.flow.flowId}]     ${position} Value_ID=${valueId}`);
  const resp = updateBlitzLineupByPosition(teamId, position, valueId, token, ctx.flow.flowId);
  const ok = stepPassed(resp, updateBlitzLineupByPositionOk(resp));
  if (ok && resp.body.updateBlitzLineupByPosition && resp.body.updateBlitzLineupByPosition.Week != null) {
    ctx.data.blitzLineupWeek = String(resp.body.updateBlitzLineupByPosition.Week);
  }
  recordStep(ctx.flow, ctx.step(stepKey), ok ? 'PASS' : 'FAIL', resp);
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
    return;
  }
  console.log(`[${ctx.flow.flowId}]     ${lineupPosition} selectable=${ids.length}`);
  const picked = pickDistinct(ids, 1, salt, used);
  if (!picked[0]) {
    skipUpdate(ctx, updateKey, `skipped because no unused selectable player for ${lineupPosition}`);
    return;
  }
  updateSlot(ctx, teamId, token, lineupPosition, picked[0], updateKey);
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
    return;
  }
  console.log(`[${ctx.flow.flowId}]     ${lineupPosition} selectable=${ids.length}`);
  const picked = pickDistinct(ids, 1, salt, used);
  if (!picked[0]) {
    skipUpdate(ctx, updateKey, `skipped because no unused selectable NFL team for ${lineupPosition}`);
    return;
  }
  updateSlot(ctx, teamId, token, lineupPosition, picked[0], updateKey);
}

export function run(ctx) {
  const token = ctx.data.token;
  const teamId = lineupTeamId(ctx);

  if (!token) {
    throw new Error(
      'Scenario "updateBlitzLineup" needs ctx.data.token. Put login or signup before it in the suite.'
    );
  }
  if (!teamId) {
    throw new Error(
      'Scenario "updateBlitzLineup" needs the team in the target league (joinedTeamId) or the owned teamId.'
    );
  }

  if (ctx.data.blitzLineupLeagueId) {
    console.log(`[${ctx.flow.flowId}]     leagueId = ${ctx.data.blitzLineupLeagueId}`);
  }
  console.log(`[${ctx.flow.flowId}]     teamId = ${teamId}`);
  stampLineupIds(ctx, teamId);

  const usedPlayers = {};
  const usedTeams = {};

  fillPlayerSlot(ctx, teamId, token, 'QB', 'getNFLPlayersQB', 'QB', 'updateQB', usedPlayers, 1);
  fillPlayerSlot(ctx, teamId, token, 'RB', 'getNFLPlayersRB1', 'RB1', 'updateRB1', usedPlayers, 2);
  fillPlayerSlot(ctx, teamId, token, 'RB', 'getNFLPlayersRB2', 'RB2', 'updateRB2', usedPlayers, 3);
  fillPlayerSlot(ctx, teamId, token, 'WR', 'getNFLPlayersWR1', 'WR1', 'updateWR1', usedPlayers, 4);
  fillPlayerSlot(ctx, teamId, token, 'WR', 'getNFLPlayersWR2', 'WR2', 'updateWR2', usedPlayers, 5);
  fillPlayerSlot(ctx, teamId, token, 'TE', 'getNFLPlayersTE', 'TE', 'updateTE', usedPlayers, 6);
  fillTeamSlot(ctx, teamId, token, 'K', 'getNFLTeamsK', 'K', 'updateK', usedTeams, 7);
  fillTeamSlot(ctx, teamId, token, 'OFF', 'getNFLTeamsOFF', 'OFF', 'updateOFF', usedTeams, 8);
  fillTeamSlot(ctx, teamId, token, 'DEF', 'getNFLTeamsDEF', 'DEF', 'updateDEF', usedTeams, 9);

  return true;
}
