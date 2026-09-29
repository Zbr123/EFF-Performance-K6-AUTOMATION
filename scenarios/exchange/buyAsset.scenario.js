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
  buyExchangeAsset,
  buyExchangeAssetOk,
  getExchangeAssetsForExchangeTeam,
  getExchangeAssetsForExchangeTeamOk,
  getExchangePortfolio,
  getExchangePortfolioOk,
} from '../../graphql/exchange.graphql.js';

export const id = 'buyExchangeAsset';

export const steps = [
  { key: 'getExchangePortfolioBefore', label: 'getExchangePortfolio (before buy)' },
  { key: 'getExchangeAssetsForExchangeTeam', label: 'getExchangeAssetsForExchangeTeam' },
  { key: 'buyExchangeAsset', label: 'buyExchangeAsset' },
  { key: 'getExchangePortfolioAfter', label: 'getExchangePortfolio (after buy)' },
];

function compactAssetsResponse(resp) {
  const data = resp && resp.body && resp.body.getExchangeAssetsForExchangeTeam;
  if (!data || !data.Exchange_Assets) return resp;
  const assets = data.Exchange_Assets.Assets || {};
  return {
    res: resp.res,
    body: {
      getExchangeAssetsForExchangeTeam: {
        statusCode: data.statusCode,
        message: data.message,
        Exchange_Assets: {
          Exchange_Team_ID: data.Exchange_Assets.Exchange_Team_ID,
          Week: data.Exchange_Assets.Week,
          Number_of_Assets: data.Exchange_Assets.Number_of_Assets,
          Team_Details: data.Exchange_Assets.Team_Details,
          Assets: {
            Players: { count: (assets.Players || []).length },
            Teams: { count: (assets.Teams || []).length },
          },
        },
      },
    },
    errors: resp.errors,
    is5xx: resp.is5xx,
    gqlErr: resp.gqlErr,
  };
}

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'buyExchangeAsset');
  const teamId = exchangePortfolioTeamId(ctx);
  if (!teamId) {
    throw new Error(
      'Scenario "buyExchangeAsset" needs an active Exchange team from createExchangeTeam, joinLeague, or the pool.'
    );
  }


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
  recordStep(
    flow,
    ctx.step('getExchangeAssetsForExchangeTeam'),
    okAssets ? 'PASS' : 'FAIL',
    okAssets ? compactAssetsResponse(assetsResp) : assetsResp
  );
  if (!okAssets) return false;

  const catalogDetails = (catalog && catalog.Team_Details) || {};
  const transactionDetails = Object.assign({}, beforeDetails);
  Object.keys(catalogDetails).forEach((key) => {
    if (catalogDetails[key] != null) transactionDetails[key] = catalogDetails[key];
  });
  const cash = transactionDetails.Cash_On_Hand == null
    ? NaN
    : Number(transactionDetails.Cash_On_Hand);
  let buyAttempted = false;
  let buySucceeded = true;
  let buyResp = null;
  let buyTransientFailure = false;
  ctx.data.exchangeBuyAssetCandidates = '0';
  const transactionDecision = exchangeTransactionDecision(transactionDetails);
  if (!isFinite(cash)) {
    recordStep(flow, ctx.step('buyExchangeAsset'), 'SKIP', null, 'portfolio cash balance was not available', 'business');
  } else if (!transactionDecision.allowed) {
    const reason = transactionDecision.mode === 'EXHAUSTED'
      ? 'weekly Exchange transaction limit is exhausted'
      : 'Exchange transaction state is unavailable';
    recordStep(flow, ctx.step('buyExchangeAsset'), 'SKIP', null, reason, 'business');
  } else {
    const candidates = collectExchangeAssets(catalog && catalog.Assets, 'isBuyable')
      .filter((candidate) => candidate.price !== '' && candidate.price <= cash);
    ctx.data.exchangeBuyAssetCandidates = textValue(candidates.length);
    const selected = selectExchangeAsset(candidates);

    if (!selected) {
      recordStep(flow, ctx.step('buyExchangeAsset'), 'SKIP', null, 'no affordable buyable Exchange asset was returned', 'business');
    } else {
      ctx.data.exchangeBuyAssetId = selected.assetId;
      ctx.data.exchangeBuyAssetType = selected.assetType;
      ctx.data.exchangeBuyAssetPrice = textValue(selected.price);
      ctx.data.exchangeBuyAssetDescription = selected.description;

      buyAttempted = true;
      buyResp = buyExchangeAsset(teamId, selected.assetId, selected.assetType, token, flow.flowId);
      const buyPayload = buyResp.body && buyResp.body.buyExchangeAsset;
      const responseMatches = !!buyPayload &&
        String(buyPayload.Asset_ID) === selected.assetId &&
        String(buyPayload.Asset_Type).toUpperCase() === selected.assetType.toUpperCase() &&
        String(buyPayload.Team_ID) === teamId;
      const okBuy = stepPassed(buyResp, buyExchangeAssetOk(buyResp) && responseMatches);
      if (okBuy) {
        ctx.data.exchangeBuyCompleted = true;
        ctx.data.exchangeBuyResponseAssetId = String(buyPayload.Asset_ID);
      } else {
        buySucceeded = false;
        buyTransientFailure = isTransientWriteFail(buyResp);
      }
      recordStep(flow, ctx.step('buyExchangeAsset'), okBuy ? 'PASS' : 'FAIL', buyResp);
    }
  }

  const afterResp = getExchangePortfolio(teamId, token, flow.flowId);
  const afterPortfolio = afterResp.body && afterResp.body.getExchangePortfolio && afterResp.body.getExchangePortfolio.portfolio;
  const afterPayloadOk = getExchangePortfolioOk(afterResp) && portfolioBelongsToTeam(afterResp, teamId);
  const purchasedVisible = !!(buyAttempted && afterPayloadOk && afterPortfolio &&
    portfolioContainsAsset(afterPortfolio, ctx.data.exchangeBuyAssetId, ctx.data.exchangeBuyAssetType));

  if (buyAttempted && !buySucceeded && buyTransientFailure && purchasedVisible) {
    markFailRecovered(flow, ctx.step('buyExchangeAsset').key);
    buySucceeded = true;
    ctx.data.exchangeBuyCompleted = true;
  }

  const afterVisible = !buyAttempted || !buySucceeded || purchasedVisible;
  const afterOk = stepPassed(afterResp, afterPayloadOk && afterVisible);
  if (afterPortfolio && afterPayloadOk) stampExchangePortfolio(ctx, afterPortfolio, 'after');
  recordStep(flow, ctx.step('getExchangePortfolioAfter'), afterOk ? 'PASS' : 'FAIL', afterResp);
  return buySucceeded && afterOk;
}
