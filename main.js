import exec from 'k6/execution';
import { SUITE, TOTAL_ITERATIONS, VUS } from './config/env.config.js';
import { loadPool, pickUser, resolveJoinHost, resolveLineupLeague } from './pool/user.pool.js';
import { getSuite } from './config/suites.config.js';
import { buildPlan, runChain } from './core/chain.runner.js';
import { handleSummary as writeSummary } from './reporting/html.reporter.js';
import * as deleteAccountsScenario from './scenarios/auth/deleteAccounts.scenario.js';
import * as loginScenario from './scenarios/auth/login.scenario.js';
import * as signupScenario from './scenarios/auth/signup.scenario.js';
import * as createBlitzLeagueScenario from './scenarios/blitz/createLeague.scenario.js';
import * as createBlitzLineupScenario from './scenarios/blitz/createLineup.scenario.js';
import * as createBlitzTeamScenario from './scenarios/blitz/createTeam.scenario.js';
import * as joinPrivateBlitzLeagueScenario from './scenarios/blitz/joinLeague.scenario.js';
import * as getBlitzLeagueDetailsScenario from './scenarios/blitz/getLeagueDetails.scenario.js';
import * as getCurrentWeekBlitzLineupScenario from './scenarios/blitz/getCurrentWeekLineup.scenario.js';
import * as getLeagueResultsByWeekScenario from './scenarios/blitz/getLeagueResults.scenario.js';
import * as updateBlitzLineupScenario from './scenarios/blitz/updateLineup.scenario.js';
import { login, loginOk } from './graphql/auth.graphql.js';
import { getEFFTimeframe, getEFFTimeframeOk, parseEffTimeframe } from './graphql/timeframe.graphql.js';

const suite = getSuite(SUITE);

const SCENARIOS = {
  signup: signupScenario,
  login: loginScenario,
  deleteAccounts: deleteAccountsScenario,
  createBlitzLeague: createBlitzLeagueScenario,
  createBlitzTeam: createBlitzTeamScenario,
  joinPrivateBlitzLeague: joinPrivateBlitzLeagueScenario,
  createBlitzLineup: createBlitzLineupScenario,
  updateBlitzLineup: updateBlitzLineupScenario,
  getCurrentWeekBlitzLineup: getCurrentWeekBlitzLineupScenario,
  getBlitzLeagueDetails: getBlitzLeagueDetailsScenario,
  getLeagueResultsByWeek: getLeagueResultsByWeekScenario,
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

function cloneUsers(shared) {
  const users = [];
  for (let i = 0; i < shared.length; i++) {
    users.push(shared[i]);
  }
  return users;
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
  let users = cloneUsers(pool.users);
  let inviteCode = '';
  let lineupLeagueId = '';

  if (suite.requirePool && users.length === 0) {
    exec.test.abort(
      `SUITE=${suite.name} requires data/users.json. ` +
      `Run first: k6 run main.js -e SUITE=signup -e ITERATIONS=${TOTAL_ITERATIONS} -e VUS=${VUS}`
    );
  }

  if (suite.requireJoinHost) {
    const resolved = resolveJoinHost(users, pool.password);
    users = resolved.users;
    inviteCode = resolved.inviteCode;
    if (users.length === 0) {
      exec.test.abort(
        `SUITE=${suite.name} has no eligible joiners. Run signup first: ` +
        `k6 run main.js -e SUITE=signup -e ITERATIONS=${TOTAL_ITERATIONS}`
      );
    }
  }

  if (suite.requireLineupLeague) {
    const resolved = resolveLineupLeague(users, pool.password);
    users = resolved.users;
    lineupLeagueId = resolved.leagueId;
    if (resolved.inviteCode) inviteCode = resolved.inviteCode;
  }

  if (suite.requirePool && suite.uniqueUsers && users.length < TOTAL_ITERATIONS) {
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

  if (suite.requireTeam) {
    users = users.filter((u) => u.blitz && (u.blitz.joinedTeamId || u.blitz.teamId));
    if (users.length < TOTAL_ITERATIONS) {
      exec.test.abort(
        `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} pool users with blitz.joinedTeamId or blitz.teamId, found ${users.length}. ` +
        `Run first: k6 run main.js -e SUITE=blitz-create-team -e ITERATIONS=${TOTAL_ITERATIONS} ` +
        `or k6 run main.js -e SUITE=blitz-join-league -e ITERATIONS=${TOTAL_ITERATIONS}`
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
    suiteName: suite.name,
    password: pool.password,
    users: users,
    inviteCode: inviteCode,
    lineupLeagueId: lineupLeagueId,
    timeframe: timeframe,
  };
}

export default function (data) {
  const iterationInTest = exec.scenario.iterationInTest;
  let user = null;

  if (suite.requirePool) {
    user = pickUser(data.users, iterationInTest, suite.uniqueUsers);
    if (!user) {
      exec.test.abort(`No pool user assigned for iteration ${iterationInTest}`);
    }
  }

  runChain(suite.scenarios, SCENARIOS, {
    user: user,
    password: data.password,
    inviteCode: data.inviteCode || '',
    lineupLeagueId: data.lineupLeagueId || '',
    timeframe: data.timeframe || null,
  });
}

export function handleSummary(data) {
  return writeSummary(data, suite);
}
