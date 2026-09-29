import exec from 'k6/execution';
import { SUITE, TOTAL_ITERATIONS, VUS } from './config/env.config.js';
import { getPoolUser, loadPool, resolvePrivateLeagueJoin, resolveLineupLeague, resolveExchangeLineupLeague, resolvePublicBlitzJoin, resolvePublicBlitzLineup, resolvePublicExchangeJoin, resolvePublicExchangeLineup } from './pool/user.pool.js';
import { getSuite } from './config/suites.config.js';
import { buildPlan, runChain } from './core/chain.runner.js';
import { handleSummary as writeSummary } from './reporting/html.reporter.js';
import * as deleteAccountsScenario from './scenarios/auth/deleteAccounts.scenario.js';
import * as loginScenario from './scenarios/auth/login.scenario.js';
import * as refreshSessionScenario from './scenarios/auth/refreshSession.scenario.js';
import * as signupScenario from './scenarios/auth/signup.scenario.js';
import * as createBlitzLeagueScenario from './scenarios/blitz/createLeague.scenario.js';
import * as createBlitzTeamScenario from './scenarios/blitz/createTeam.scenario.js';
import * as joinPrivateBlitzLeagueScenario from './scenarios/blitz/joinLeague.scenario.js';
import * as createBlitzLineupScenario from './scenarios/blitz/createLineup.scenario.js';
import * as updateBlitzLineupScenario from './scenarios/blitz/updateLineup.scenario.js';
import * as getCurrentWeekBlitzLineupScenario from './scenarios/blitz/getCurrentWeekLineup.scenario.js';
import * as getBlitzLeagueDetailsScenario from './scenarios/blitz/getLeagueDetails.scenario.js';
import * as getLeagueResultsByWeekScenario from './scenarios/blitz/getLeagueResults.scenario.js';
import * as joinPublicBlitzLeagueScenario from './scenarios/blitz/joinPublicLeague.scenario.js';
import * as createExchangeLeagueScenario from './scenarios/exchange/createLeague.scenario.js';
import * as createExchangeTeamScenario from './scenarios/exchange/createTeam.scenario.js';
import * as getExchangePortfolioScenario from './scenarios/exchange/getPortfolio.scenario.js';
import * as buyExchangeAssetScenario from './scenarios/exchange/buyAsset.scenario.js';
import * as sellExchangeAssetScenario from './scenarios/exchange/sellAsset.scenario.js';
import * as getExchangeLeagueDetailsScenario from './scenarios/exchange/getLeagueDetails.scenario.js';
import * as getExchangeTransactionsScenario from './scenarios/exchange/getTransactions.scenario.js';
import * as joinPublicExchangeLeagueScenario from './scenarios/exchange/joinPublicLeague.scenario.js';
import * as tradeExchangeAssetsScenario from './scenarios/exchange/tradeAssets.scenario.js';
import * as joinPrivateExchangeLeagueScenario from './scenarios/exchange/joinLeague.scenario.js';
import { login, loginOk } from './graphql/auth.graphql.js';
import { getEFFTimeframe, getEFFTimeframeOk, parseEffTimeframe } from './graphql/timeframe.graphql.js';

const suite = getSuite(SUITE);

const SCENARIOS = {
  signup: signupScenario,
  login: loginScenario,
  refreshSession: refreshSessionScenario,
  deleteAccounts: deleteAccountsScenario,
  createBlitzLeague: createBlitzLeagueScenario,
  createBlitzTeam: createBlitzTeamScenario,
  joinPrivateBlitzLeague: joinPrivateBlitzLeagueScenario,
  createBlitzLineup: createBlitzLineupScenario,
  updateBlitzLineup: updateBlitzLineupScenario,
  getCurrentWeekBlitzLineup: getCurrentWeekBlitzLineupScenario,
  getBlitzLeagueDetails: getBlitzLeagueDetailsScenario,
  getLeagueResultsByWeek: getLeagueResultsByWeekScenario,
  joinPublicBlitzLeague: joinPublicBlitzLeagueScenario,
  createExchangeLeague: createExchangeLeagueScenario,
  createExchangeTeam: createExchangeTeamScenario,
  getExchangePortfolio: getExchangePortfolioScenario,
  buyExchangeAsset: buyExchangeAssetScenario,
  sellExchangeAsset: sellExchangeAssetScenario,
  getExchangeLeagueDetails: getExchangeLeagueDetailsScenario,
  getExchangeTransactions: getExchangeTransactionsScenario,
  joinPublicExchangeLeague: joinPublicExchangeLeagueScenario,
  tradeExchangeAssets: tradeExchangeAssetsScenario,
  joinPrivateExchangeLeague: joinPrivateExchangeLeagueScenario,
};

const PLAN = buildPlan(suite.scenarios, SCENARIOS);

export const options = {
  scenarios: {
    suite_run: {
      executor: suite.executor || 'shared-iterations',
      vus: VUS,
      iterations: TOTAL_ITERATIONS,
      maxDuration: '60m',
    },
  },
  thresholds: {
    checks: ['rate>0.90'],
    http_req_failed: ['rate<0.10'],
    server_errors_5xx: ['count==0'],
  },
};

function selectedUserIndexes(allUsers, selectedUsers) {
  const indexes = {};
  for (let i = 0; i < allUsers.length; i++) {
    if (allUsers[i] && allUsers[i].email) indexes[String(allUsers[i].email).toLowerCase()] = i;
  }
  return (selectedUsers || []).map((user) => indexes[String(user.email || '').toLowerCase()]);
}

function fetchSetupTimeframe(user, password) {
  if (!user) {
    exec.test.abort('SUITE needs a pool user in setup() to call getEFFTimeframe once.');
  }
  const loginResp = login(user.email, password, 'setup');
  if (!loginOk(loginResp)) {
    exec.test.abort(`setup() login failed for ${user.email}; cannot read getEFFTimeframe.`);
  }
  const token = loginResp.body.login.accessToken;
  const tfResp = getEFFTimeframe(token, 'setup');
  if (!getEFFTimeframeOk(tfResp)) {
    exec.test.abort('setup() getEFFTimeframe failed. League details cannot pick a standings view.');
  }
  const parsed = parseEffTimeframe(tfResp);
  console.log(
    `Timeframe getEFFTimeframe once season=${parsed.season} seasonType=${parsed.seasonType} ` +
    `week=${parsed.week} phase=${parsed.seasonPhase}`
  );
  return parsed;
}

export function setup() {
  const pool = loadPool();
  const allUsers = pool.users;
  let users = allUsers;
  let inviteCode = '';
  let exchangeInviteCode = '';
  let exchangeTargetLeagueId = '';
  let privateJoinLeagueId = '';
  let lineupLeagueId = '';
  let exchangeLineupLeagueId = '';
  let publicLeagueId = '';
  let exchangePublicLeagueId = '';

  if (suite.requirePool && users.length === 0) {
    exec.test.abort(
      `SUITE=${suite.name} requires data/users.json. ` +
      `Run first: k6 run main.js -e SUITE=signup -e ITERATIONS=${TOTAL_ITERATIONS} -e VUS=${VUS}`
    );
  }

  if (suite.requirePrivateLeagueJoin) {
    const isExchange = suite.requirePrivateLeagueJoin === 'exchange';
    const resolved = resolvePrivateLeagueJoin(users, pool.password, suite.requirePrivateLeagueJoin);
    users = resolved.users;
    privateJoinLeagueId = resolved.leagueId;
    if (isExchange) {
      exchangeInviteCode = resolved.inviteCode;
      exchangeTargetLeagueId = resolved.leagueId;
    } else {
      inviteCode = resolved.inviteCode;
    }
  }

  if (suite.requirePublicJoin) {
    const resolved = resolvePublicBlitzJoin(users, pool.password);
    users = resolved.users;
    publicLeagueId = resolved.leagueId;
    if (users.length === 0) {
      exec.test.abort(
        `SUITE=${suite.name} has no eligible joiners for public league ${publicLeagueId || '(unknown)'}. ` +
        `Users already have a team there, or the pool is empty. Run signup first: ` +
        `k6 run main.js -e SUITE=signup -e ITERATIONS=${TOTAL_ITERATIONS}`
      );
    }
  }

  if (suite.requirePublicLineup) {
    const resolved = resolvePublicBlitzLineup(users, pool.password);
    users = resolved.users;
    lineupLeagueId = resolved.leagueId;
    publicLeagueId = resolved.leagueId;
  }

  if (suite.requireLineupLeague) {
    const resolved = resolveLineupLeague(users, pool.password);
    users = resolved.users;
    lineupLeagueId = resolved.leagueId;
    if (resolved.inviteCode) inviteCode = resolved.inviteCode;
  }

  if (suite.requireExchangeLineupLeague) {
    const resolved = resolveExchangeLineupLeague(users, pool.password);
    users = resolved.users;
    exchangeLineupLeagueId = resolved.leagueId;
    if (resolved.inviteCode) exchangeInviteCode = resolved.inviteCode;
  }

  if (suite.requirePublicExchangeJoin) {
    const resolved = resolvePublicExchangeJoin(users, pool.password);
    users = resolved.users;
    exchangePublicLeagueId = resolved.leagueId;
    if (users.length === 0) {
      exec.test.abort(
        `SUITE=${suite.name} has no eligible joiners for public Exchange league ${exchangePublicLeagueId || '(unknown)'}. ` +
        `Users already have a team there, or the pool is empty. Run signup first: ` +
        `k6 run main.js -e SUITE=signup -e ITERATIONS=${TOTAL_ITERATIONS}`
      );
    }
  }

  if (suite.requirePublicExchangeLineup) {
    const resolved = resolvePublicExchangeLineup(users, pool.password);
    users = resolved.users;
    exchangeLineupLeagueId = resolved.leagueId;
    exchangePublicLeagueId = resolved.leagueId;
  }

  if (suite.requirePool && suite.uniqueUsers && users.length < TOTAL_ITERATIONS) {
    if (suite.requirePublicJoin && publicLeagueId) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} pool users without a team in public league ${publicLeagueId}, found ${users.length}. ` +
        `Lower ITERATIONS, or signup more users.`
      );
    }
    if (suite.requirePublicLineup && publicLeagueId) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} pool users with a team in public league ${publicLeagueId}, found ${users.length}. ` +
        `Lower ITERATIONS, or run first: k6 run main.js -e SUITE=blitz-join-public-league`
      );
    }
    if (suite.requireLineupLeague && lineupLeagueId) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} users with a team in league ${lineupLeagueId}, found ${users.length}. ` +
        `Lower ITERATIONS, or join more users into that league first.`
      );
    }
    if (suite.requireLineupLeague) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} pool users with blitz.teamId, found ${users.length}. ` +
        `Run first: k6 run main.js -e SUITE=blitz-create-team -e ITERATIONS=${TOTAL_ITERATIONS}`
      );
    }
    if (suite.requireExchangeLineupLeague && exchangeLineupLeagueId) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} users with a team in Exchange league ${exchangeLineupLeagueId}, found ${users.length}. ` +
        `Lower ITERATIONS, or join more users into that league first.`
      );
    }
    if (suite.requireExchangeLineupLeague) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} pool users with exchange.teamId, found ${users.length}. ` +
        `Run first: k6 run main.js -e SUITE=exchange-create-team -e ITERATIONS=${TOTAL_ITERATIONS}`
      );
    }
    if (suite.requirePublicExchangeJoin && exchangePublicLeagueId) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} pool users without a team in public Exchange league ${exchangePublicLeagueId}, found ${users.length}. ` +
        `Lower ITERATIONS, or signup more users.`
      );
    }
    if (suite.requirePublicExchangeLineup && exchangePublicLeagueId) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} pool users with a team in public Exchange league ${exchangePublicLeagueId}, found ${users.length}. ` +
        `Lower ITERATIONS, or run first: k6 run main.js -e SUITE=exchange-join-public-league`
      );
    }
    exec.test.abort(
      `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} unique pool users, found ${users.length}. ` +
      `Create the gap: k6 run main.js -e SUITE=signup -e ITERATIONS=${TOTAL_ITERATIONS - users.length}`
    );
  }

  if (suite.requireLeague) {
    users = users.filter((u) => u.blitz && u.blitz.leagueId);
    if (users.length < TOTAL_ITERATIONS) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} pool users with blitz.leagueId, found ${users.length}. ` +
        `Run first: k6 run main.js -e SUITE=blitz-create-league -e ITERATIONS=${TOTAL_ITERATIONS}`
      );
    }
  }

  if (suite.requireExchangeLeague) {
    users = users.filter((u) => u.exchange && u.exchange.leagueId);
    if (users.length < TOTAL_ITERATIONS) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} pool users with exchange.leagueId, found ${users.length}. ` +
        `Run first: k6 run main.js -e SUITE=exchange-create-league -e ITERATIONS=${TOTAL_ITERATIONS}`
      );
    }
  }

  if (suite.requireExchangeTeam) {
    users = users.filter((u) => u.exchange && u.exchange.teamId);
    if (users.length < TOTAL_ITERATIONS) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} pool users with exchange.teamId, found ${users.length}. ` +
        `Run first: k6 run main.js -e SUITE=exchange-create-team -e ITERATIONS=${TOTAL_ITERATIONS}`
      );
    }
  }

  console.log(
    `Suite=${suite.name} chain=${suite.scenarios.join(' -> ')} steps=${PLAN.length} ` +
    `pool=${users.length} poolPath=${pool.path} vus=${VUS} iterations=${TOTAL_ITERATIONS}`
  );

  let timeframe = null;
  if (suite.requireTimeframe) {
    timeframe = fetchSetupTimeframe(users[0], pool.password);
  }

  return {
    password: pool.password,
    userIndexes: selectedUserIndexes(allUsers, users),
    inviteCode: inviteCode,
    exchangeInviteCode: exchangeInviteCode,
    exchangeTargetLeagueId: exchangeTargetLeagueId,
    privateJoinLeagueId: privateJoinLeagueId,
    lineupLeagueId: lineupLeagueId,
    exchangeLineupLeagueId: exchangeLineupLeagueId,
    exchangePublicLeagueId: exchangePublicLeagueId,
    publicLeagueId: publicLeagueId,
    timeframe: timeframe,
    forceLargeLeagueDetails: !!suite.forceLargeLeagueDetails,
  };
}

export default function (data) {
  const iterationInTest = exec.scenario.iterationInTest;
  let user = null;

  if (suite.requirePool) {
    const userIndexes = data.userIndexes || [];
    const position = suite.uniqueUsers || !userIndexes.length
      ? iterationInTest
      : iterationInTest % userIndexes.length;
    const poolIndex = userIndexes[position];
    user = getPoolUser(poolIndex);
    if (!user) {
      exec.test.abort(`No pool user assigned for iteration ${iterationInTest}`);
    }
  }

  runChain(
    suite.scenarios,
    SCENARIOS,
    {
      user: user,
      password: data.password,
      inviteCode: data.inviteCode || '',
      exchangeInviteCode: data.exchangeInviteCode || '',
      exchangeTargetLeagueId: data.exchangeTargetLeagueId || '',
      privateJoinLeagueId: data.privateJoinLeagueId || '',
      lineupLeagueId: data.lineupLeagueId || '',
      exchangeLineupLeagueId: data.exchangeLineupLeagueId || '',
      exchangePublicLeagueId: data.exchangePublicLeagueId || '',
      publicLeagueId: data.publicLeagueId || '',
      timeframe: data.timeframe || null,
      forceLargeLeagueDetails: !!data.forceLargeLeagueDetails,
    },
    PLAN
  );
}

export function handleSummary(data) {
  return writeSummary(data, suite);
}
