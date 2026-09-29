import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { isTransientWriteFail, markFailRecovered } from '../../core/write.recover.js';
import { requireToken, textValue } from '../../utils/flow.util.js';
import {
  collectExchangeAssets,
  exchangePortfolioTeamId,
  exchangeTransactionDecision,
  portfolioBelongsToTeam,
  portfolioContainsAsset,
  stampExchangePortfolio,
} from './getPortfolio.scenario.js';
import {
  buyExchangeAsset,
  buyExchangeAssetOk,
  getExchangeAssetsForExchangeTeam,
  getExchangeAssetsForExchangeTeamOk,
  getExchangePortfolio,
  getExchangePortfolioOk,
  sellExchangeAsset,
  sellExchangeAssetOk,
} from '../../graphql/exchange.graphql.js';

export const id = 'tradeExchangeAssets';

export const steps = [
  { key: 'getExchangePortfolioBefore', label: 'getExchangePortfolio (before trade)' },
  { key: 'getExchangeAssetsForExchangeTeam', label: 'getExchangeAssetsForExchangeTeam' },
  { key: 'buyExchangeAsset1', label: 'buyExchangeAsset (1st)' },
  { key: 'buyExchangeAsset2', label: 'buyExchangeAsset (2nd)' },
  { key: 'getExchangePortfolioMiddle', label: 'getExchangePortfolio (after buys)' },
  { key: 'sellExchangeAsset1', label: 'sellExchangeAsset' },
  { key: 'getExchangePortfolioAfter', label: 'getExchangePortfolio (after sell)' },
];

function skipBuy(flow, stepDef, reason) {
  recordStep(flow, stepDef, 'SKIP', null, reason, 'business');
}

function attemptBuy(flow, stepDef, token, teamId, selected) {
  const buyResp = buyExchangeAsset(teamId, selected.assetId, selected.assetType, token, flow.flowId);
  const buyPayload = buyResp.body && buyResp.body.buyExchangeAsset;
  const responseMatches = !!buyPayload &&
    String(buyPayload.Asset_ID) === selected.assetId &&
    String(buyPayload.Asset_Type).toUpperCase() === selected.assetType.toUpperCase() &&
    String(buyPayload.Team_ID) === teamId;
  const okBuy = stepPassed(buyResp, buyExchangeAssetOk(buyResp) && responseMatches);
  recordStep(flow, stepDef, okBuy ? 'PASS' : 'FAIL', buyResp);
  return { succeeded: okBuy, transient: !okBuy && isTransientWriteFail(buyResp) };
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'tradeExchangeAssets');
  const teamId = exchangePortfolioTeamId(ctx);
  if (!teamId) {
    throw new Error(
      'Scenario "tradeExchangeAssets" needs an active Exchange team from createExchangeTeam, joinLeague, or the pool.'
    );
  }


  let buy1 = 'NOT_RUN';
  let buy2 = 'NOT_RUN';
  let sell = 'NOT_RUN';

  const beforeResp = getExchangePortfolio(teamId, token, flow.flowId);
  const beforeOk = stepPassed(
    beforeResp,
    getExchangePortfolioOk(beforeResp) && portfolioBelongsToTeam(beforeResp, teamId)
  );
  recordStep(flow, ctx.step('getExchangePortfolioBefore'), beforeOk ? 'PASS' : 'FAIL', beforeResp);
  if (!beforeOk) return false;
  const beforePortfolio = beforeResp.body.getExchangePortfolio.portfolio;
  const beforeDetails = beforePortfolio.Team_Details || {};
  stampExchangePortfolio(ctx, beforePortfolio, 'before');

  const assetsResp = getExchangeAssetsForExchangeTeam(teamId, token, flow.flowId);
  const assetsData = assetsResp.body && assetsResp.body.getExchangeAssetsForExchangeTeam;
  const catalog = assetsData && assetsData.Exchange_Assets;
  const catalogBelongsToTeam = !!(catalog && String(catalog.Exchange_Team_ID) === teamId);
  const okAssets = stepPassed(
    assetsResp,
    getExchangeAssetsForExchangeTeamOk(assetsResp) && catalogBelongsToTeam
  );
  recordStep(flow, ctx.step('getExchangeAssetsForExchangeTeam'), okAssets ? 'PASS' : 'FAIL', assetsResp);
  if (!okAssets) return false;

  const catalogDetails = (catalog && catalog.Team_Details) || {};
  const transactionDetails = Object.assign({}, beforeDetails);
  Object.keys(catalogDetails).forEach((key) => {
    if (catalogDetails[key] != null) transactionDetails[key] = catalogDetails[key];
  });
  const cash = transactionDetails.Cash_On_Hand == null
    ? NaN
    : Number(transactionDetails.Cash_On_Hand);
  const transactionDecision = exchangeTransactionDecision(transactionDetails);

  let sel1 = null;
  let sel2 = null;
  let buy1Succeeded = false;
  let buy1Transient = false;
  if (!isFinite(cash)) {
    skipBuy(flow, ctx.step('buyExchangeAsset1'), 'portfolio cash balance was not available');
    skipBuy(flow, ctx.step('buyExchangeAsset2'), 'portfolio cash balance was not available');
    buy1 = 'SKIP';
    buy2 = 'SKIP';
  } else if (!transactionDecision.allowed) {
    const reason = transactionDecision.mode === 'EXHAUSTED'
      ? 'weekly Exchange transaction limit is exhausted'
      : 'Exchange transaction state is unavailable';
    skipBuy(flow, ctx.step('buyExchangeAsset1'), reason);
    skipBuy(flow, ctx.step('buyExchangeAsset2'), reason);
    buy1 = 'SKIP';
    buy2 = 'SKIP';
  } else {
    const candidates = collectExchangeAssets(catalog && catalog.Assets, 'isBuyable')
      .filter((candidate) => candidate.price !== '' && candidate.price <= cash);
    ctx.data.exchangeBuyAssetCandidates = textValue(candidates.length);
    if (candidates.length === 0) {
      skipBuy(flow, ctx.step('buyExchangeAsset1'), 'no affordable buyable Exchange asset was returned');
      skipBuy(flow, ctx.step('buyExchangeAsset2'), 'no affordable buyable Exchange asset was returned');
      buy1 = 'SKIP';
      buy2 = 'SKIP';
    } else {
      const start = Math.abs(__VU * 31 + __ITER * 17) % candidates.length;
      sel1 = candidates[start];
      sel2 = candidates.length > 1 ? candidates[(start + 1) % candidates.length] : null;

      ctx.data.exchangeBuyAssetId = sel1.assetId;
      ctx.data.exchangeBuyAssetType = sel1.assetType;
      ctx.data.exchangeBuyAssetPrice = textValue(sel1.price);
      ctx.data.exchangeBuyAssetDescription = sel1.description;
      const out1 = attemptBuy(flow, ctx.step('buyExchangeAsset1'), token, teamId, sel1);
      buy1Succeeded = out1.succeeded;
      buy1Transient = out1.transient;
      buy1 = out1.succeeded ? 'PASS' : 'FAIL';
      if (out1.succeeded) {
        ctx.data.exchangeBuyCompleted = true;
        ctx.data.exchangeBuyResponseAssetId = sel1.assetId;
      }

      if (!sel2) {
        skipBuy(flow, ctx.step('buyExchangeAsset2'), 'only one affordable buyable Exchange asset was returned');
        buy2 = 'SKIP';
      } else {
        const remaining = transactionDecision.remaining;
        const unlimited = transactionDecision.mode === 'PRESEASON_UNLIMITED';
        const spent = buy1Succeeded ? 1 : 0;
        if (!unlimited && remaining != null && isFinite(Number(remaining)) && Number(remaining) - spent <= 0) {
          skipBuy(flow, ctx.step('buyExchangeAsset2'), 'weekly Exchange transaction limit is exhausted');
          buy2 = 'SKIP';
        } else {
          const cash2 = buy1Succeeded ? cash - sel1.price : cash;
          if (sel2.price > cash2) {
            skipBuy(flow, ctx.step('buyExchangeAsset2'), 'second buyable asset is no longer affordable after the first buy');
            buy2 = 'SKIP';
          } else {
            ctx.data.exchangeBuy2AssetDescription = sel2.description;
            const out2 = attemptBuy(flow, ctx.step('buyExchangeAsset2'), token, teamId, sel2);
            buy2 = out2.succeeded ? 'PASS' : 'FAIL';
            if (out2.succeeded) ctx.data.exchangeBuy2Completed = true;
            if (!out2.succeeded && out2.transient) {
              ctx.data.exchangeBuy2Transient = true;
            }
          }
        }
      }
    }
  }

  const middleResp = getExchangePortfolio(teamId, token, flow.flowId);
  const middlePortfolio = middleResp.body && middleResp.body.getExchangePortfolio
    ? middleResp.body.getExchangePortfolio.portfolio
    : null;
  const middleReadOk = stepPassed(
    middleResp,
    getExchangePortfolioOk(middleResp) && portfolioBelongsToTeam(middleResp, teamId)
  );
  recordStep(flow, ctx.step('getExchangePortfolioMiddle'), middleReadOk ? 'PASS' : 'FAIL', middleResp);
  const middleFallback = !middleReadOk;
  const effectiveMiddle = middleReadOk ? middlePortfolio : beforePortfolio;
  if (middleReadOk && middlePortfolio) stampExchangePortfolio(ctx, middlePortfolio, 'after');

  if (buy1 === 'FAIL' && buy1Transient && sel1 && effectiveMiddle && portfolioContainsAsset(effectiveMiddle, sel1.assetId, sel1.assetType)) {
    markFailRecovered(flow, ctx.step('buyExchangeAsset1').key);
    buy1 = 'RECOVERED';
    buy1Succeeded = true;
    ctx.data.exchangeBuyCompleted = true;
  }
  if (buy2 === 'FAIL' && ctx.data.exchangeBuy2Transient && sel2 && effectiveMiddle && portfolioContainsAsset(effectiveMiddle, sel2.assetId, sel2.assetType)) {
    markFailRecovered(flow, ctx.step('buyExchangeAsset2').key);
    buy2 = 'RECOVERED';
    ctx.data.exchangeBuy2Completed = true;
    delete ctx.data.exchangeBuy2Transient;
  }

  const middleDetails = (effectiveMiddle && effectiveMiddle.Team_Details) || {};
  const sellDecision = exchangeTransactionDecision(middleDetails);
  const sellCandidates = collectExchangeAssets(effectiveMiddle && effectiveMiddle.Assets, 'isSellable');
  ctx.data.exchangeSellAssetCandidates = textValue(sellCandidates.length);
  ctx.data.exchangeSellTransactionDecision = sellDecision.mode;
  let sellAttempted = false;
  let sellSucceeded = true;
  let sellTransient = false;
  let sellSelected = null;
  if (!sellDecision.allowed) {
    const reason = sellDecision.mode === 'EXHAUSTED'
      ? 'weekly Exchange transaction limit is exhausted'
      : 'Exchange transaction state is unavailable';
    recordStep(flow, ctx.step('sellExchangeAsset1'), 'SKIP', null, reason, 'business');
    sell = 'SKIP';
  } else if (sellCandidates.length === 0) {
    recordStep(
      flow,
      ctx.step('sellExchangeAsset1'),
      'SKIP',
      null,
      'no sellable asset was found in the Exchange portfolio',
      'business'
    );
    sell = 'SKIP';
  } else {
    const start = Math.abs(__VU * 31 + __ITER * 17) % sellCandidates.length;
    sellSelected = sellCandidates[start];
    ctx.data.exchangeSellAssetId = sellSelected.assetId;
    ctx.data.exchangeSellAssetType = sellSelected.assetType;
    ctx.data.exchangeSellAssetPosition = sellSelected.assetPosition;
    ctx.data.exchangeSellAssetPrice = textValue(sellSelected.price);
    ctx.data.exchangeSellAssetDescription = sellSelected.description;
    ctx.data.exchangeSellAttempted = true;
    sellAttempted = true;

    const sellResp = sellExchangeAsset(teamId, sellSelected.assetId, sellSelected.assetType, token, flow.flowId);
    const sellPayload = sellResp.body && sellResp.body.sellExchangeAsset;
    if (sellPayload) {
      ctx.data.exchangeSellResponseAssetId = textValue(sellPayload.Asset_ID);
      ctx.data.exchangeSellResponseAssetType = textValue(sellPayload.Asset_Type);
      ctx.data.exchangeSellResponseTeamId = textValue(sellPayload.Team_ID);
    }
    const responseMatches = !!sellPayload &&
      String(sellPayload.Asset_ID) === sellSelected.assetId &&
      String(sellPayload.Asset_Type).toUpperCase() === sellSelected.assetType.toUpperCase() &&
      String(sellPayload.Team_ID) === teamId;
    const okSell = stepPassed(sellResp, sellExchangeAssetOk(sellResp) && responseMatches);
    recordStep(flow, ctx.step('sellExchangeAsset1'), okSell ? 'PASS' : 'FAIL', sellResp);
    sell = okSell ? 'PASS' : 'FAIL';
    sellSucceeded = okSell;
    if (!okSell) sellTransient = isTransientWriteFail(sellResp);
    else ctx.data.exchangeSellCompleted = true;
  }

  const afterResp = getExchangePortfolio(teamId, token, flow.flowId);
  const afterPortfolio = afterResp.body && afterResp.body.getExchangePortfolio
    ? afterResp.body.getExchangePortfolio.portfolio
    : null;
  const afterPayloadOk = getExchangePortfolioOk(afterResp) && portfolioBelongsToTeam(afterResp, teamId);
  const removed = !!(
    sellAttempted &&
    afterPayloadOk &&
    afterPortfolio &&
    sellSelected &&
    !portfolioContainsAsset(afterPortfolio, sellSelected.assetId, sellSelected.assetType)
  );
  if (sellAttempted && !sellSucceeded && sellTransient && removed) {
    markFailRecovered(flow, ctx.step('sellExchangeAsset1').key);
    sell = 'RECOVERED';
    sellSucceeded = true;
    ctx.data.exchangeSellRecovered = true;
    ctx.data.exchangeSellCompleted = true;
  }
  ctx.data.exchangeSellVerification = sellAttempted ? `removed:${removed ? 'true' : 'false'}` : 'removed:not_applicable reason:sell_not_attempted';
  const afterVisible = !sellAttempted || !sellSucceeded ? afterPayloadOk : afterPayloadOk && removed;
  const afterOk = stepPassed(afterResp, afterPayloadOk && afterVisible);
  if (afterPortfolio && afterPayloadOk) stampExchangePortfolio(ctx, afterPortfolio, 'after');
  recordStep(flow, ctx.step('getExchangePortfolioAfter'), afterOk ? 'PASS' : 'FAIL', afterResp);

  ctx.data.exchangeTradeSummary = `buy1:${buy1} buy2:${buy2} middle:${middleReadOk ? 'PASS' : 'FAIL(fallback)'} sell:${sell}`.substring(0, 300);
  return beforeOk && okAssets && afterOk;
}
