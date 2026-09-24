import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import {
  getPublicBlitzLeagues,
  getPublicBlitzLeaguesOk,
  joinPublicBlitzLeague,
  joinPublicBlitzLeagueOk,
  pickPublicBlitzLeague,
  publicJoinAlreadyMember,
} from '../../graphql/blitz.graphql.js';

export const id = 'joinPublicBlitzLeague';

export const steps = [
  { key: 'getPublicBlitzLeagues', label: 'getPublicBlitzLeagues' },
  { key: 'joinPublicBlitzLeague', label: 'joinPublicBlitzLeague' },
];

function stampPublicLeague(ctx, league) {
  const leagueId = String(league._id);
  ctx.data.blitzLeagueId = leagueId;
  ctx.data.blitzJoinedLeagueId = leagueId;
  if (league.League_Name) ctx.data.blitzLeagueName = String(league.League_Name);
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = ctx.data.token;

  if (!token) {
    throw new Error(
      'Scenario "joinPublicBlitzLeague" needs ctx.data.token. Put login or signup before it in the suite.'
    );
  }

  const listResp = getPublicBlitzLeagues(token, flow.flowId);
  const okList = stepPassed(listResp, getPublicBlitzLeaguesOk(listResp));
  recordStep(flow, ctx.step('getPublicBlitzLeagues'), okList ? 'PASS' : 'FAIL', listResp);
  if (!okList) return false;

  const picked = pickPublicBlitzLeague(listResp.body.getPublicBlitzLeagues.leagues);
  if (!picked || !picked._id) {
    throw new Error(
      'Scenario "joinPublicBlitzLeague" found no public Extreme Blitz league (Game_Type EXTREME, Game_Week 0).'
    );
  }

  const leagueId = String(picked._id);
  console.log(`[${flow.flowId}]     publicLeagueId = ${leagueId}`);
  if (picked.League_Name) console.log(`[${flow.flowId}]     publicLeagueName = ${picked.League_Name}`);

  const joinResp = joinPublicBlitzLeague(leagueId, token, flow.flowId);
  if (publicJoinAlreadyMember(joinResp)) {
    stampPublicLeague(ctx, picked);
    recordStep(flow, ctx.step('joinPublicBlitzLeague'), 'PASS', joinResp);
    return true;
  }

  const okJoin = stepPassed(joinResp, joinPublicBlitzLeagueOk(joinResp));
  if (okJoin) {
    const joinedId = String(joinResp.body.joinPublicBlitzLeague.League_ID);
    stampPublicLeague(ctx, { _id: joinedId, League_Name: picked.League_Name });
  }
  recordStep(flow, ctx.step('joinPublicBlitzLeague'), okJoin ? 'PASS' : 'FAIL', joinResp);

  return okJoin;
}
