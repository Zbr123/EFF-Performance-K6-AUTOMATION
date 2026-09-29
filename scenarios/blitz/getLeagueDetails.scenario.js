import { recordBusinessRule, recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireData, requireToken, textValue } from '../../utils/flow.util.js';
import {
  getBlitzLeague,
  getBlitzLeagueOk,
  isPreseasonTimeframe,
  pickBlitzLeague,
  pickBlitzLeagueDetailsView,
} from '../../graphql/blitz.graphql.js';

export const id = 'getBlitzLeagueDetails';

export const steps = [
  { key: 'getBlitzLeague', label: 'getBlitzLeague' },
  { key: 'getBlitzLeagueDetails', label: 'getBlitzLeagueDetails' },
];

export function timeframeData(ctx) {
  return {
    seasonType: ctx.data.effSeasonType,
    week: ctx.data.effWeek,
    seasonPhase: ctx.data.effSeasonPhase,
  };
}

export function timeframeText(timeframe) {
  return `SeasonType=${textValue(timeframe.seasonType) || '-'} Week=${textValue(timeframe.week) || '-'} phase=${textValue(timeframe.seasonPhase) || '-'}`;
}

export function describeRankedTeam(team, pointsField) {
  if (!team) return '';
  const name = team.Team_Name || team.Team_ID || '';
  const rank = team.Rank == null ? '' : `rank ${team.Rank}`;
  const points = team[pointsField] == null ? '' : `${team[pointsField]} pts`;
  return [name, rank, points].filter((part) => part !== '').join(' - ');
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'getBlitzLeagueDetails');
  const leagueId = requireData(
    ctx,
    'blitzLeagueId',
    'getBlitzLeagueDetails',
    'ctx.data.blitzLeagueId from the target league or the owned league'
  );


  const leagueResp = getBlitzLeague(leagueId, token, flow.flowId);
  const league = pickBlitzLeague(leagueResp, leagueId);
  const okLeague = stepPassed(leagueResp, getBlitzLeagueOk(leagueResp) && !!league);
  recordStep(flow, ctx.step('getBlitzLeague'), okLeague ? 'PASS' : 'FAIL', leagueResp);
  if (!okLeague) return false;

  ctx.data.blitzLeagueId = String(league._id);
  ctx.data.blitzLeagueName = league.League_Name || ctx.data.blitzLeagueName || '';
  ctx.data.blitzLeagueMembers = league.Members == null ? '' : String(league.Members);
  if (league.Invite_Code) ctx.data.blitzInviteCode = String(league.Invite_Code);

  const planned = ctx.step('getBlitzLeagueDetails');
  const timeframe = timeframeData(ctx);
  const view = pickBlitzLeagueDetailsView(
    timeframe,
    ctx.data.blitzLeagueMembers,
    { forceLarge: !!ctx.data.blitzForceLargeLeagueDetails }
  );

  if (!view) {
    if (isPreseasonTimeframe(timeframe)) {
      recordBusinessRule(
        flow,
        planned,
        'PRESEASON_NO_STANDINGS',
        `Preseason has no matches; standings unavailable (${timeframeText(timeframe)})`
      );
      return true;
    }
    recordStep(
      flow,
      planned,
      'SKIP',
      null,
      `no league details view for ${timeframeText(timeframe)} Members=${ctx.data.blitzLeagueMembers || '-'}`,
      'business'
    );
    return true;
  }

  const detailsResp = view.call(ctx.data.blitzLeagueId, token, flow.flowId);
  const payload = (detailsResp.body && detailsResp.body[view.label]) || {};
  const details = payload.details || {};
  const leagueMatches = details.League_ID != null &&
    String(details.League_ID) === String(ctx.data.blitzLeagueId);
  const okDetails = stepPassed(detailsResp, view.ok(detailsResp) && leagueMatches);
  if (okDetails) {
    const teams = Array.isArray(details.Teams) ? details.Teams : [];
    ctx.data.blitzDetailsView = view.label;
    ctx.data.blitzDetailsTeamCount = textValue(teams.length);
    ctx.data.blitzDetailsTopTeam = describeRankedTeam(teams[0], 'Total_Points');
  }
  recordStep(
    flow,
    { num: planned.num, key: planned.key, label: view.label },
    okDetails ? 'PASS' : 'FAIL',
    detailsResp
  );

  return okDetails;
}
