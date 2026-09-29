import { createUserFlow, finalizeUserFlow, recordStep } from './flow.tracker.js';
import { copyFlowFields, emptyFlowFields } from './flow.fields.js';

export function buildPlan(scenarioNames, registry) {
  const plan = [];
  const seen = {};
  let num = 1;

  for (let i = 0; i < scenarioNames.length; i++) {
    const name = scenarioNames[i];
    const scenario = registry[name];
    if (!scenario || typeof scenario.run !== 'function') {
      throw new Error(
        `Scenario "${name}" is not registered in main.js SCENARIOS. ` +
        `Known: ${Object.keys(registry).join(', ')}`
      );
    }
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      throw new Error(`Scenario "${name}" must export a non-empty steps array.`);
    }
    for (let j = 0; j < scenario.steps.length; j++) {
      const step = scenario.steps[j];
      if (!step || !step.key || !step.label) {
        throw new Error(`Scenario "${name}" has an invalid step at index ${j}; key and label are required.`);
      }
      const key = `${name}.${step.key}`;
      if (seen[key]) {
        throw new Error(`Duplicate scenario step key "${key}" in ${name}.`);
      }
      seen[key] = true;
      plan.push({
        num: num++,
        key,
        label: step.label,
        scenario: name,
        step: step.key,
      });
    }
  }

  return plan;
}

function stepLookup(plan, scenarioName) {
  return function (key) {
    const found = plan.find((p) => p.scenario === scenarioName && p.step === key);
    if (!found) {
      throw new Error(`Scenario "${scenarioName}" has no step "${key}" in its exported steps`);
    }
    return found;
  };
}

function skipUnrecorded(flow, plan, reason) {
  for (let i = 0; i < plan.length; i++) {
    const already = flow.steps.some((s) => s.key === plan[i].key);
    if (!already) {
      recordStep(flow, plan[i], 'SKIP', null, reason, 'dependency');
    }
  }
}

function scenarioErrorResponse(error) {
  const message = error && error.message ? error.message : String(error);
  return {
    res: null,
    body: {},
    errors: [{ message }],
    is5xx: false,
    gqlErr: {
      statusCode: 400,
      errorCode: 'SCENARIO_EXCEPTION',
      message,
    },
  };
}

function recordScenarioException(flow, plan, scenarioName, error) {
  const message = error && error.message ? error.message : String(error);
  const scenarioPlan = plan.filter((p) => p.scenario === scenarioName);
  const missing = scenarioPlan.find((p) => !flow.steps.some((s) => s.key === p.key));
  if (missing) {
    recordStep(flow, missing, 'FAIL', scenarioErrorResponse(error), message);
  } else {
    recordStep(
      flow,
      { num: flow.steps.length + 1, key: `${scenarioName}.exception`, label: `${scenarioName} exception` },
      'FAIL',
      scenarioErrorResponse(error),
      message
    );
  }
}

function seedData(user, seed) {
  const blitz = (user && user.blitz) || {};
  const exchange = (user && user.exchange) || {};
  const targetLeague = seed.lineupLeagueId ? String(seed.lineupLeagueId) : '';
  let leagueId = blitz.leagueId || '';
  let leagueName = blitz.leagueName || '';
  let teamId = blitz.teamId || '';
  let teamName = blitz.teamName || '';

  if (targetLeague) {
    leagueId = targetLeague;
    leagueName = '';
    if (String(blitz.joinedLeagueId || '') === targetLeague && blitz.joinedTeamId) {
      teamId = String(blitz.joinedTeamId);
      teamName = blitz.joinedTeamName || '';
    } else if (String(blitz.leagueId || '') === targetLeague && blitz.teamId) {
      teamId = String(blitz.teamId);
      teamName = blitz.teamName || '';
      leagueName = blitz.leagueName || '';
    } else {
      teamId = '';
      teamName = '';
    }
  }

  const data = emptyFlowFields();
  data.email = (user && user.email) || '';
  data.username = (user && user.username) || '';
  data.userId = (user && user.userId) || '';
  data.token = '';
  data.blitzLeagueId = leagueId;
  data.blitzLeagueName = leagueName;
  data.blitzTeamId = teamId;
  data.blitzTeamName = teamName;
  data.blitzInviteCode = seed.inviteCode || blitz.inviteCode || '';
  data.blitzJoinedLeagueId = blitz.joinedLeagueId || '';
  data.blitzJoinedTeamId = blitz.joinedTeamId || '';
  data.blitzJoinedTeamName = blitz.joinedTeamName || '';
  data.blitzLineupWeek = seed.timeframe && seed.timeframe.week
    ? String(seed.timeframe.week)
    : (blitz.lineupWeek || '');
  data.blitzLineupLeagueId = targetLeague;
  data.blitzPublicLeagueId = seed.publicLeagueId || '';
  const exchangeTargetLeague = seed.exchangeLineupLeagueId ? String(seed.exchangeLineupLeagueId) : '';
  let exchangeLeagueId = exchange.leagueId || '';
  let exchangeLeagueName = exchange.leagueName || '';
  let exchangeTeamId = exchange.teamId || '';
  let exchangeTeamName = exchange.teamName || '';
  if (exchangeTargetLeague) {
    exchangeLeagueId = exchangeTargetLeague;
    exchangeLeagueName = '';
    if (String(exchange.joinedLeagueId || '') === exchangeTargetLeague && exchange.joinedTeamId) {
      exchangeTeamId = String(exchange.joinedTeamId);
      exchangeTeamName = exchange.joinedTeamName || '';
    } else if (String(exchange.leagueId || '') === exchangeTargetLeague && exchange.teamId) {
      exchangeTeamId = String(exchange.teamId);
      exchangeTeamName = exchange.teamName || '';
      exchangeLeagueName = exchange.leagueName || '';
    } else {
      exchangeTeamId = '';
      exchangeTeamName = '';
    }
  }
  data.exchangeLeagueId = exchangeLeagueId;
  data.exchangeLeagueName = exchangeLeagueName;
  data.exchangeTeamId = exchangeTeamId;
  data.exchangeTeamName = exchangeTeamName;
  data.exchangeInviteCode = seed.exchangeInviteCode || exchange.inviteCode || '';
  data.exchangeTargetLeagueId = seed.exchangeTargetLeagueId || '';
  data.exchangeLineupLeagueId = exchangeTargetLeague;
  data.exchangePublicLeagueId = seed.exchangePublicLeagueId || '';
  data.privateJoinLeagueId = seed.privateJoinLeagueId || '';
  data.exchangeJoinedLeagueId = exchange.joinedLeagueId || '';
  data.exchangeJoinedTeamId = exchange.joinedTeamId || '';
  data.exchangeJoinedTeamName = exchange.joinedTeamName || '';
  data.exchangePortfolioReadCount = 0;
  data.exchangeBuyCompleted = '';
  data.exchangeSellAssetId = '';
  data.exchangeSellAssetType = '';
  data.exchangeSellAssetPosition = '';
  data.exchangeSellAssetPrice = '';
  data.exchangeSellAssetDescription = '';
  data.exchangeSellAssetCandidates = '';
  data.exchangeSellResponseAssetId = '';
  data.exchangeSellResponseAssetType = '';
  data.exchangeSellResponseTeamId = '';
  data.exchangeSellAttempted = '';
  data.exchangeSellRecovered = '';
  data.exchangeSellTransactionDecision = '';
  data.exchangeSellCompleted = '';
  data.exchangeSellVerification = '';
  data.blitzForceLargeLeagueDetails = !!seed.forceLargeLeagueDetails;
  data.effSeasonType = seed.timeframe ? String(seed.timeframe.seasonType || '') : '';
  data.effWeek = seed.timeframe ? String(seed.timeframe.week || '') : '';
  data.effSeasonPhase = seed.timeframe ? String(seed.timeframe.seasonPhase || '') : '';
  return data;
}

function syncFlow(flow, data) {
  copyFlowFields(flow, data);
}

export function runChain(scenarioNames, registry, seed, compiledPlan) {
  const plan = compiledPlan || buildPlan(scenarioNames, registry);
  const user = seed.user || null;

  const flow = createUserFlow({
    email: (user && user.email) || '',
    username: (user && user.username) || '',
    userId: (user && user.userId) || '',
    exchangeLeagueId: (user && user.exchange && user.exchange.leagueId) || '',
    exchangeLeagueName: (user && user.exchange && user.exchange.leagueName) || '',
    exchangeTeamId: (user && user.exchange && user.exchange.teamId) || '',
    exchangeTeamName: (user && user.exchange && user.exchange.teamName) || '',
    exchangeInviteCode: (user && user.exchange && user.exchange.inviteCode) || '',
    exchangeJoinedLeagueId: (user && user.exchange && user.exchange.joinedLeagueId) || '',
    exchangeJoinedTeamId: (user && user.exchange && user.exchange.joinedTeamId) || '',
    exchangeJoinedTeamName: (user && user.exchange && user.exchange.joinedTeamName) || '',
  });

  const ctx = {
    flow: flow,
    user: user,
    password: seed.password,
    data: seedData(user, seed),
    step: null,
  };

  console.log(`\n============================================================`);
  console.log(`===== START CHAIN ${flow.flowId}  [${scenarioNames.join(' -> ')}]`);
  if (ctx.data.email) console.log(`      email    = ${ctx.data.email}`);
  console.log(`============================================================`);

  let failedAt = '';
  let thrownError = null;

  try {
    for (let i = 0; i < scenarioNames.length; i++) {
      const name = scenarioNames[i];
      const scenario = registry[name];

      ctx.step = stepLookup(plan, name);
      console.log(`[${flow.flowId}] >>> scenario ${i + 1}/${scenarioNames.length}: ${name}`);

      let ok = false;
      try {
        ok = scenario.run(ctx);
      } catch (error) {
        recordScenarioException(flow, plan, name, error);
        thrownError = error;
        ok = false;
      }
      syncFlow(flow, ctx.data);

      if (!ok) {
        failedAt = name;
        break;
      }
    }
  } finally {
    skipUnrecorded(
      flow,
      plan,
      failedAt ? `skipped after scenario "${failedAt}" failed` : 'not reached'
    );
    finalizeUserFlow(flow, plan);
  }

  if (thrownError) throw thrownError;
  return flow;
}
