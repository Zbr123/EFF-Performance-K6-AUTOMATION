import exec from 'k6/execution';
import { SUITE, TOTAL_ITERATIONS, VUS } from './config/env.config.js';
import { loadPool, pickUser } from './pool/user.pool.js';
import { getSuite } from './config/suites.config.js';
import { buildPlan, runChain } from './core/chain.runner.js';
import { handleSummary as writeSummary } from './reporting/html.reporter.js';
import * as deleteAccountsScenario from './scenarios/deleteAccounts.scenario.js';
import * as loginScenario from './scenarios/login.scenario.js';
import * as signupScenario from './scenarios/signup.scenario.js';

const suite = getSuite(SUITE);

const SCENARIOS = {
  signup: signupScenario,
  login: loginScenario,
  deleteAccounts: deleteAccountsScenario,
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

export function setup() {
  const pool = loadPool();
  const users = cloneUsers(pool.users);

  if (suite.requirePool && users.length === 0) {
    exec.test.abort(
      `SUITE=${suite.name} requires data/users.json. ` +
      `Run first: k6 run main.js -e SUITE=signup -e ITERATIONS=${TOTAL_ITERATIONS} -e VUS=${VUS}`
    );
  }

  if (suite.requirePool && suite.uniqueUsers && users.length < TOTAL_ITERATIONS) {
    exec.test.abort(
      `SUITE=${suite.name} needs ${TOTAL_ITERATIONS} unique pool users, found ${users.length}. ` +
      `Create the gap: k6 run main.js -e SUITE=signup -e ITERATIONS=${TOTAL_ITERATIONS - users.length}`
    );
  }

  console.log(
    `Suite=${suite.name} chain=${suite.scenarios.join(' -> ')} steps=${PLAN.length} ` +
    `pool=${users.length} poolPath=${pool.path} vus=${VUS} iterations=${TOTAL_ITERATIONS}`
  );

  return {
    suiteName: suite.name,
    password: pool.password,
    users: users,
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

  runChain(suite.scenarios, SCENARIOS, { user: user, password: data.password });
}

export function handleSummary(data) {
  return writeSummary(data, suite);
}
