import { recordStep, stepPassed } from '../../core/flow.tracker.js';
import { requireToken, textValue } from '../../utils/flow.util.js';
import {
  exchangePortfolioTeamId,
  portfolioBelongsToTeam,
} from './getPortfolio.scenario.js';
import {
  getExchangePortfolioTransactions,
  getExchangePortfolioTransactionsOk,
} from '../../graphql/exchange.graphql.js';

export const id = 'getExchangeTransactions';

export const steps = [
  { key: 'getExchangePortfolioTransactions', label: 'getExchangePortfolioTransactions' },
];

export function run(ctx) {
  const flow = ctx.flow;
  const token = requireToken(ctx, 'getExchangeTransactions');
  const teamId = exchangePortfolioTeamId(ctx);
  if (!teamId) {
    throw new Error(
      'Scenario "getExchangeTransactions" needs an active Exchange team from createExchangeTeam, joinLeague, or the pool.'
    );
  }


  const resp = getExchangePortfolioTransactions(teamId, token, flow.flowId);
  const ok = stepPassed(
    resp,
    getExchangePortfolioTransactionsOk(resp) && portfolioBelongsToTeam(resp, teamId)
  );

  if (ok) {
    const portfolio = resp.body.getExchangePortfolio.portfolio;
    const details = portfolio.Team_Details || {};
    ctx.data.exchangeTransactionsWeek = textValue(portfolio.Week);
    ctx.data.exchangeTransactionsAssetCount = textValue(portfolio.Number_of_Assets);
    ctx.data.exchangeTransactionsTotal = textValue(details.Total_Transactions);
  }

  recordStep(flow, ctx.step('getExchangePortfolioTransactions'), ok ? 'PASS' : 'FAIL', resp);
  return ok;
}
