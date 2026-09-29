import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { isTransientWriteFail, markFailRecovered } from '../../core/write.recover.js';
import { requireToken, textValue } from '../../utils/flow.util.js';
import {
  collectExchangeAssets,
  exchangePortfolioTeamId,
  exchangeTransactionDecision,
  portfolioBelongsToTeam,
  portfolioContainsAsset,
  selectExchangeAsset,
  stampExchangePortfolio,
} from './getPortfolio.scenario.js';
import {
  getExchangePortfolio,
  getExchangePortfolioOk,
  sellExchangeAsset,
  sellExchangeAssetOk,
} from '../../graphql/exchange.graphql.js';

export const id = 'sellExchangeAsset';

export const steps = [
  { key: 'getExchangePortfolioBefore', label: 'getExchangePortfolio (before sell)' },
  { key: 'sellExchangeAsset', label: 'sellExchangeAsset' },
  { key: 'getExchangePortfolioAfter', label: 'getExchangePortfolio (after sell)' },
];

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return isFinite(number) ? number : null;
}

function delta(before, after) {
  const beforeNumber = numberOrNull(before);
  const afterNumber = numberOrNull(after);
  return beforeNumber == null || afterNumber == null ? null : afterNumber - beforeNumber;
}

function formatDelta(value) {
  return value == null ? 'n/a' : String(Math.round(value * 100) / 100);
}

function transactionSkipReason(decision) {
  if (decision.mode === 'EXHAUSTED') return 'weekly Exchange transaction limit is exhausted';
  return 'Exchange transaction state is unavailable';
}

function portfolioAssetsPresent(portfolio) {
  const assets = portfolio && portfolio.Assets;
  return !!(
    assets &&
    (Object.prototype.hasOwnProperty.call(assets, 'Players') ||
      Object.prototype.hasOwnProperty.call(assets, 'Teams'))
  );
}

function buildSellVerification(before, after, afterValid, selected, attempted, succeeded, recovered) {
  if (!attempted) return 'removed:not_applicable reason:sell_not_attempted';

  const beforeDetails = (before && before.Team_Details) || {};
  const afterDetails = (after && after.Team_Details) || {};
  const removed = !!(
    afterValid &&
    after &&
    !portfolioContainsAsset(after, selected.assetId, selected.assetType)
  );
  const parts = [
    `removed:${removed ? 'true' : 'false'}`,
    `countDelta:${formatDelta(delta(before && before.Number_of_Assets, after && after.Number_of_Assets))}`,
    `cashDelta:${formatDelta(delta(beforeDetails.Cash_On_Hand, afterDetails.Cash_On_Hand))}`,
    `assetValueDelta:${formatDelta(delta(beforeDetails.Assets_Value, afterDetails.Assets_Value))}`,
    `totalValueDelta:${formatDelta(delta(beforeDetails.Total_Value, afterDetails.Total_Value))}`,
    `usedDelta:${formatDelta(delta(beforeDetails.Transactions_Used, afterDetails.Transactions_Used))}`,
    `remainingDelta:${formatDelta(delta(beforeDetails.Transactions_Remaining, afterDetails.Transactions_Remaining))}`,
    `totalTxDelta:${formatDelta(delta(beforeDetails.Total_Transactions, afterDetails.Total_Transactions))}`,
  ];
  if (recovered) parts.push('recovered:true');
  if (!succeeded) parts.push('mutation:confirmed_failure');
  return parts.join(' ').substring(0, 300);
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'sellExchangeAsset');
  const teamId = exchangePortfolioTeamId(ctx);
  if (!teamId) {
    throw new Error(
      'Scenario "sellExchangeAsset" needs an active Exchange team from createExchangeTeam, joinLeague, or the pool.'
    );
  }


  const beforeResp = getExchangePortfolio(teamId, token, flow.flowId);
  const beforeOk = stepPassed(
    beforeResp,
    getExchangePortfolioOk(beforeResp) &&
      portfolioBelongsToTeam(beforeResp, teamId) &&
      portfolioAssetsPresent(beforeResp.body.getExchangePortfolio.portfolio)
  );
  recordStep(flow, ctx.step('getExchangePortfolioBefore'), beforeOk ? 'PASS' : 'FAIL', beforeResp);
  if (!beforeOk) return false;

  const beforePortfolio = beforeResp.body.getExchangePortfolio.portfolio;
  const teamDetails = beforePortfolio.Team_Details || {};
  stampExchangePortfolio(ctx, beforePortfolio, 'before');

  const candidates = collectExchangeAssets(beforePortfolio.Assets, 'isSellable');
  ctx.data.exchangeSellAssetCandidates = textValue(candidates.length);
  const selected = selectExchangeAsset(candidates);
  const transactionDecision = exchangeTransactionDecision(teamDetails);
  ctx.data.exchangeSellTransactionDecision = transactionDecision.mode;

  let sellAttempted = false;
  let sellSucceeded = true;
  let sellTransientFailure = false;

  if (!transactionDecision.allowed) {
    recordStep(
      flow,
      ctx.step('sellExchangeAsset'),
      'SKIP',
      null,
      transactionSkipReason(transactionDecision),
      'business'
    );
  } else if (!selected) {
    recordStep(
      flow,
      ctx.step('sellExchangeAsset'),
      'SKIP',
      null,
      'no sellable asset was found in the Exchange portfolio',
      'business'
    );
  } else {
    ctx.data.exchangeSellAssetId = selected.assetId;
    ctx.data.exchangeSellAssetType = selected.assetType;
    ctx.data.exchangeSellAssetPosition = selected.assetPosition;
    ctx.data.exchangeSellAssetPrice = textValue(selected.price);
    ctx.data.exchangeSellAssetDescription = selected.description;
    ctx.data.exchangeSellAttempted = true;
    sellAttempted = true;

    const sellResp = sellExchangeAsset(teamId, selected.assetId, selected.assetType, token, flow.flowId);
    const sellPayload = sellResp.body && sellResp.body.sellExchangeAsset;
    if (sellPayload) {
      ctx.data.exchangeSellResponseAssetId = textValue(sellPayload.Asset_ID);
      ctx.data.exchangeSellResponseAssetType = textValue(sellPayload.Asset_Type);
      ctx.data.exchangeSellResponseTeamId = textValue(sellPayload.Team_ID);
    }
    const responseMatches = !!sellPayload &&
      String(sellPayload.Asset_ID) === selected.assetId &&
      String(sellPayload.Asset_Type).toUpperCase() === selected.assetType.toUpperCase() &&
      String(sellPayload.Team_ID) === teamId;
    const okSell = stepPassed(sellResp, sellExchangeAssetOk(sellResp) && responseMatches);
    if (okSell) {
      sellSucceeded = true;
      ctx.data.exchangeSellCompleted = true;
    } else {
      sellSucceeded = false;
      sellTransientFailure = isTransientWriteFail(sellResp);
    }
    recordStep(flow, ctx.step('sellExchangeAsset'), okSell ? 'PASS' : 'FAIL', sellResp);
  }

  const afterResp = getExchangePortfolio(teamId, token, flow.flowId);
  const afterPortfolio = afterResp.body && afterResp.body.getExchangePortfolio && afterResp.body.getExchangePortfolio.portfolio;
  const afterPayloadOk = getExchangePortfolioOk(afterResp) &&
    portfolioBelongsToTeam(afterResp, teamId) &&
    portfolioAssetsPresent(afterPortfolio);
  const removed = !!(
    sellAttempted &&
    afterPayloadOk &&
    afterPortfolio &&
    selected &&
    !portfolioContainsAsset(afterPortfolio, selected.assetId, selected.assetType)
  );

  if (sellAttempted && !sellSucceeded && sellTransientFailure && removed) {
    markFailRecovered(flow, ctx.step('sellExchangeAsset').key);
    sellSucceeded = true;
    ctx.data.exchangeSellRecovered = true;
    ctx.data.exchangeSellCompleted = true;
  }

  ctx.data.exchangeSellVerification = buildSellVerification(
    beforePortfolio,
    afterPortfolio,
    afterPayloadOk,
    selected,
    sellAttempted,
    sellSucceeded,
    !!ctx.data.exchangeSellRecovered
  );

  const afterVisible = !sellAttempted || !sellSucceeded ? afterPayloadOk : afterPayloadOk && removed;
  const afterOk = stepPassed(afterResp, afterPayloadOk && afterVisible);
  if (afterPortfolio && afterPayloadOk) stampExchangePortfolio(ctx, afterPortfolio, 'after');
  recordStep(flow, ctx.step('getExchangePortfolioAfter'), afterOk ? 'PASS' : 'FAIL', afterResp);
  return sellSucceeded && afterOk;
}
