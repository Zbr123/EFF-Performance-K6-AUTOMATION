import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireToken, textValue } from '../../utils/flow.util.js';
import {
  getExchangePortfolio,
  getExchangePortfolioOk,
} from '../../graphql/exchange.graphql.js';

export const id = 'getExchangePortfolio';

export const steps = [
  { key: 'getExchangePortfolio', label: 'getExchangePortfolio' },
];


export function exchangePortfolioTeamId(ctx) {
  const lineupLeagueId = ctx.data.exchangeLineupLeagueId
    ? String(ctx.data.exchangeLineupLeagueId)
    : '';
  if (lineupLeagueId) {
    const poolExchange = (ctx.user && ctx.user.exchange) || {};
    if (
      String(poolExchange.joinedLeagueId || '') === lineupLeagueId &&
      poolExchange.joinedTeamId
    ) {
      return String(poolExchange.joinedTeamId);
    }
    if (
      String(poolExchange.leagueId || '') === lineupLeagueId &&
      poolExchange.teamId
    ) {
      return String(poolExchange.teamId);
    }
    if (ctx.data.exchangeTeamId) return String(ctx.data.exchangeTeamId);
    return '';
  }
  const targetLeagueId = ctx.data.exchangeTargetLeagueId
    ? String(ctx.data.exchangeTargetLeagueId)
    : '';
  if (
    targetLeagueId &&
    String(ctx.data.exchangeJoinedLeagueId || '') === targetLeagueId &&
    ctx.data.exchangeJoinedTeamId
  ) {
    return String(ctx.data.exchangeJoinedTeamId);
  }
  return ctx.data.exchangeTeamId ? String(ctx.data.exchangeTeamId) : '';
}

function portfolioSnapshot(portfolio) {
  const details = portfolio.Team_Details || {};
  return [
    `week:${textValue(portfolio.Week)}`,
    `assets:${textValue(portfolio.Number_of_Assets)}`,
    `cash:${textValue(details.Cash_On_Hand)}`,
    `assetValue:${textValue(details.Assets_Value)}`,
    `total:${textValue(details.Total_Value)}`,
    `used:${textValue(details.Transactions_Used)}`,
    `remaining:${textValue(details.Transactions_Remaining)}`,
    `limit:${textValue(details.Transaction_Limit)}`,
    `preseason:${textValue(details.Preseason_Transactions)}`,
    `totalTx:${textValue(details.Total_Transactions)}`,
  ].join('/');
}

export function stampExchangePortfolio(ctx, portfolio, phase) {
  const details = portfolio.Team_Details || {};
  const snapshot = portfolioSnapshot(portfolio);
  if (phase === 'before') {
    ctx.data.exchangePortfolioBefore = snapshot;
  } else if (phase === 'after') {
    ctx.data.exchangePortfolioAfter = snapshot;
  }
  ctx.data.exchangePortfolioWeek = textValue(portfolio.Week);
  ctx.data.exchangePortfolioAssetCount = textValue(portfolio.Number_of_Assets);
  ctx.data.exchangePortfolioCash = textValue(details.Cash_On_Hand);
  ctx.data.exchangePortfolioAssetsValue = textValue(details.Assets_Value);
  ctx.data.exchangePortfolioTotalValue = textValue(details.Total_Value);
  ctx.data.exchangePortfolioTransactionsUsed = textValue(details.Transactions_Used);
  ctx.data.exchangePortfolioTransactionsRemaining = textValue(details.Transactions_Remaining);
  ctx.data.exchangePortfolioTransactionLimit = textValue(details.Transaction_Limit);
  ctx.data.exchangePortfolioPreseasonTransactions = textValue(details.Preseason_Transactions);
  ctx.data.exchangePortfolioTotalTransactions = textValue(details.Total_Transactions);
  ctx.data.exchangePortfolioLeagueId = textValue(details.League_ID);
}

export function portfolioContainsAsset(portfolio, assetId, assetType) {
  const assets = portfolio.Assets || {};
  const rows = [].concat(assets.Players || [], assets.Teams || []);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].Asset_ID) !== String(assetId)) continue;
    if (!assetType || String(rows[i].AssetType).toUpperCase() === String(assetType).toUpperCase()) return true;
  }
  return false;
}

export function portfolioBelongsToTeam(resp, teamId) {
  const data = resp && resp.body && resp.body.getExchangePortfolio;
  const portfolio = data && data.portfolio;
  return !!(portfolio && String(portfolio.Team_ID) === String(teamId));
}

const ASSET_TYPES = ['PLAYER', 'TEAM_OFF', 'TEAM_DEF'];
const PLAYER_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function assetType(row, fallbackType) {
  const position = String(row.Asset_Position || '').trim().toUpperCase();
  let inferred = String(fallbackType || '').trim().toUpperCase();
  if (position === 'OFF') inferred = 'TEAM_OFF';
  if (position === 'DEF') inferred = 'TEAM_DEF';
  return String(row.AssetType || inferred).trim().toUpperCase();
}

function assetDescription(row) {
  const details = row.Player_Details || row.Team_Details || {};
  const nflTeam = row.NFL_Team_Details || {};
  const name = details.FullName || nflTeam.FullName || row.Asset_ID;
  const teamName = row.NFL_Team_Details
    ? (row.NFL_Team_Details.FullName || row.NFL_Team_Details.ShortName || '')
    : (details.ShortName || '');
  return teamName
    ? `${name} - ${row.Asset_ID} - ${teamName}`
    : `${name} - ${row.Asset_ID}`;
}

export function collectExchangeAssets(assets, eligibilityField) {
  const rows = [].concat(
    (assets && assets.Players) || [],
    (assets && assets.Teams) || []
  );
  const candidates = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (
      !row ||
      row.Asset_ID == null ||
      row.Asset_ID === '' ||
      !row.Eligibility ||
      row.Eligibility[eligibilityField] !== true
    ) continue;

    const type = assetType(row, row.Player_Details ? 'PLAYER' : '');
    if (ASSET_TYPES.indexOf(type) < 0) continue;

    const position = String(row.Asset_Position || '').trim().toUpperCase();
    if (type === 'PLAYER' && PLAYER_POSITIONS.indexOf(position) < 0) continue;

    if (row.Current_Price == null || row.Current_Price === '') continue;
    const price = Number(row.Current_Price);
    if (!isFinite(price) || price < 0) continue;

    candidates.push({
      assetId: String(row.Asset_ID),
      assetType: type,
      assetPosition: position,
      price,
      description: assetDescription(row),
    });
  }

  return candidates;
}

export function selectExchangeAsset(candidates) {
  if (!candidates || !candidates.length) return null;
  const start = Math.abs(__VU * 31 + __ITER * 17) % candidates.length;
  return candidates[start] || candidates[0];
}

export function exchangeTransactionDecision(details) {
  const tx = details || {};
  const preseason = String(tx.Preseason_Transactions).toLowerCase() === 'true';
  if (preseason) {
    return { allowed: true, mode: 'PRESEASON_UNLIMITED', remaining: null };
  }

  const remainingRaw = tx.Transactions_Remaining;
  if (remainingRaw != null && remainingRaw !== '') {
    const remaining = Number(remainingRaw);
    if (isFinite(remaining)) {
      return {
        allowed: remaining > 0,
        mode: remaining > 0 ? 'WEEKLY' : 'EXHAUSTED',
        remaining,
      };
    }
  }

  const usedRaw = tx.Transactions_Used;
  const limitRaw = tx.Transaction_Limit;
  if (usedRaw != null && usedRaw !== '' && limitRaw != null && limitRaw !== '') {
    const used = Number(usedRaw);
    const limit = Number(limitRaw);
    if (isFinite(used) && isFinite(limit)) {
      return {
        allowed: used < limit,
        mode: used < limit ? 'WEEKLY_DERIVED' : 'EXHAUSTED',
        remaining: limit - used,
      };
    }
  }

  return { allowed: false, mode: 'UNKNOWN', remaining: null };
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'getExchangePortfolio');
  const teamId = exchangePortfolioTeamId(ctx);
  if (!teamId) {
    throw new Error(
      'Scenario "getExchangePortfolio" needs an active Exchange team from createExchangeTeam, joinLeague, or the pool.'
    );
  }


  const resp = getExchangePortfolio(teamId, token, flow.flowId);
  const ok = stepPassed(
    resp,
    getExchangePortfolioOk(resp) && portfolioBelongsToTeam(resp, teamId)
  );

  if (ok) {
    const portfolio = resp.body.getExchangePortfolio.portfolio;
    const readCount = Number(ctx.data.exchangePortfolioReadCount || 0);
    ctx.data.exchangePortfolioReadCount = readCount + 1;
    const phase = readCount === 0 ? 'before' : readCount === 1 ? 'after' : null;
    stampExchangePortfolio(ctx, portfolio, phase);
  }

  recordStep(flow, ctx.step('getExchangePortfolio'), ok ? 'PASS' : 'FAIL', resp);
  return ok;
}
