import { recordBusinessRule, recordStep, stepPassed } from '../../core/flow.tracker.js';
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

export function run(ctx) {
  const flow = ctx.flow;
  const token = ctx.data.token;
  const leagueId = ctx.data.blitzLeagueId ? String(ctx.data.blitzLeagueId) : '';

  if (!token) {
    throw new Error(
      'Scenario "getBlitzLeagueDetails" needs ctx.data.token. Put login or signup before it in the suite.'
    );
  }
  if (!leagueId) {
    throw new Error(
      'Scenario "getBlitzLeagueDetails" needs ctx.data.blitzLeagueId from the target league (JOIN_HOST_EMAIL + JOIN_INVITE_CODE) or the owned league.'
    );
  }

  console.log(`[${flow.flowId}]     leagueId = ${leagueId}`);

  const leagueResp = getBlitzLeague(leagueId, token, flow.flowId);
  const league = pickBlitzLeague(leagueResp, leagueId);
  const okLeague = stepPassed(leagueResp, getBlitzLeagueOk(leagueResp) && !!league);
  recordStep(flow, ctx.step('getBlitzLeague'), okLeague ? 'PASS' : 'FAIL', leagueResp);
  if (!okLeague) return false;

  ctx.data.blitzLeagueId = String(league._id);
  ctx.data.blitzLeagueName = league.League_Name || ctx.data.blitzLeagueName || '';
  ctx.data.blitzLeagueMembers = league.Members == null ? '' : String(league.Members);
  if (league.Invite_Code) ctx.data.blitzInviteCode = String(league.Invite_Code);

  console.log(
    `[${flow.flowId}]     members=${ctx.data.blitzLeagueMembers} name=${ctx.data.blitzLeagueName}`
  );

  const planned = ctx.step('getBlitzLeagueDetails');
  const timeframe = {
    seasonType: ctx.data.effSeasonType,
    week: ctx.data.effWeek,
    seasonPhase: ctx.data.effSeasonPhase,
  };
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
        `Preseason has no matches; standings unavailable (SeasonType=${ctx.data.effSeasonType || '-'} Week=${ctx.data.effWeek || '-'} phase=${ctx.data.effSeasonPhase || '-'})`
      );
      return true;
    }
    recordStep(
      flow,
      planned,
      'SKIP',
      null,
      `no league details view for SeasonType=${ctx.data.effSeasonType || '-'} Week=${ctx.data.effWeek || '-'} Members=${ctx.data.blitzLeagueMembers || '-'}`
    );
    return true;
  }

  console.log(
    `[${flow.flowId}]     ${view.label} leagueId=${ctx.data.blitzLeagueId} week=${ctx.data.effWeek} members=${ctx.data.blitzLeagueMembers}`
  );

  const detailsResp = view.call(ctx.data.blitzLeagueId, token, flow.flowId);
  const okDetails = stepPassed(detailsResp, view.ok(detailsResp));
  recordStep(
    flow,
    { num: planned.num, key: planned.key, label: view.label },
    okDetails ? 'PASS' : 'FAIL',
    detailsResp
  );

  return okDetails;
}
