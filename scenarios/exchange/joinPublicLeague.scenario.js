import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireToken } from '../../utils/flow.util.js';
import {
  getPublicExchangeLeagues,
  getPublicExchangeLeaguesOk,
  joinPublicExchangeLeague,
  joinPublicExchangeLeagueOk,
  pickPublicExchangeLeague,
  publicExchangeJoinAlreadyMember,
} from '../../graphql/exchange.graphql.js';

export const id = 'joinPublicExchangeLeague';

export const steps = [
  { key: 'getPublicExchangeLeagues', label: 'getPublicExchangeLeagues' },
  { key: 'joinPublicExchangeLeague', label: 'joinPublicExchangeLeague' },
];

function stampPublicLeague(ctx, league) {
  const leagueId = String(league._id);
  ctx.data.exchangeLeagueId = leagueId;
  ctx.data.exchangeJoinedLeagueId = leagueId;
  if (league.League_Name) ctx.data.exchangeLeagueName = String(league.League_Name);
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'joinPublicExchangeLeague');

  const listResp = getPublicExchangeLeagues(token, flow.flowId);
  const okList = stepPassed(listResp, getPublicExchangeLeaguesOk(listResp));
  recordStep(flow, ctx.step('getPublicExchangeLeagues'), okList ? 'PASS' : 'FAIL', listResp);
  if (!okList) return false;

  const picked = pickPublicExchangeLeague(
    listResp.body.getPublicExchangeLeagues.leagues,
    ctx.data.exchangePublicLeagueId
  );
  if (!picked || !picked._id) {
    throw new Error(
      'Scenario "joinPublicExchangeLeague" found no public Extreme Exchange league (Game_Type EXTREME, Game_Week 0).'
    );
  }

  const leagueId = String(picked._id);
  if (picked.League_Name) console.log(`[${flow.flowId}]     publicExchangeLeagueName = ${picked.League_Name}`);

  const joinResp = joinPublicExchangeLeague(leagueId, token, flow.flowId);
  if (publicExchangeJoinAlreadyMember(joinResp)) {
    stampPublicLeague(ctx, picked);
    recordStep(flow, ctx.step('joinPublicExchangeLeague'), 'PASS', joinResp);
    return true;
  }

  const okJoin = stepPassed(joinResp, joinPublicExchangeLeagueOk(joinResp));
  if (okJoin) {
    const joinedId = String(joinResp.body.joinPublicExchangeLeague.League_ID);
    stampPublicLeague(ctx, { _id: joinedId, League_Name: picked.League_Name });
  }
  recordStep(flow, ctx.step('joinPublicExchangeLeague'), okJoin ? 'PASS' : 'FAIL', joinResp);

  return okJoin;
}
