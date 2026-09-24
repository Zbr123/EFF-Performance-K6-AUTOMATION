import { createUserFlow, finalizeUserFlow, recordStep } from './flow.tracker.js';

export function buildPlan(scenarioNames, registry) {
  const plan = [];
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
    const steps = scenario.steps || [];
    for (let j = 0; j < steps.length; j++) {
      plan.push({
        num: num++,
        key: `${name}.${steps[j].key}`,
        label: steps[j].label,
        scenario: name,
        step: steps[j].key,
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
      recordStep(flow, plan[i], 'SKIP', null, reason);
    }
  }
}

function seedData(user, seed) {
  const blitz = (user && user.blitz) || {};
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

  return {
    email: (user && user.email) || '',
    username: (user && user.username) || '',
    userId: (user && user.userId) || '',
    token: '',
    blitzLeagueId: leagueId,
    blitzLeagueName: leagueName,
    blitzTeamId: teamId,
    blitzTeamName: teamName,
    blitzInviteCode: seed.inviteCode || blitz.inviteCode || '',
    blitzJoinedLeagueId: blitz.joinedLeagueId || '',
    blitzLineupWeek: seed.timeframe && seed.timeframe.week ? String(seed.timeframe.week) : (blitz.lineupWeek || ''),
    blitzLineupLeagueId: targetLeague,
    blitzLeagueMembers: '',
    blitzForceLargeLeagueDetails: !!seed.forceLargeLeagueDetails,
    effSeasonType: seed.timeframe ? String(seed.timeframe.seasonType || '') : '',
    effWeek: seed.timeframe ? String(seed.timeframe.week || '') : '',
    effSeasonPhase: seed.timeframe ? String(seed.timeframe.seasonPhase || '') : '',
  };
}

function syncFlow(flow, data) {
  flow.email = data.email || flow.email;
  flow.username = data.username || flow.username;
  flow.userId = data.userId || flow.userId;
  flow.blitzLeagueId = data.blitzLeagueId || flow.blitzLeagueId || '';
  flow.blitzLeagueName = data.blitzLeagueName || flow.blitzLeagueName || '';
  flow.blitzTeamId = data.blitzTeamId || flow.blitzTeamId || '';
  flow.blitzTeamName = data.blitzTeamName || flow.blitzTeamName || '';
  flow.blitzInviteCode = data.blitzInviteCode || flow.blitzInviteCode || '';
  flow.blitzJoinedLeagueId = data.blitzJoinedLeagueId || flow.blitzJoinedLeagueId || '';
  flow.blitzLineupWeek = data.blitzLineupWeek || flow.blitzLineupWeek || '';
}

export function runChain(scenarioNames, registry, seed) {
  const plan = buildPlan(scenarioNames, registry);
  const user = seed.user || null;

  const flow = createUserFlow({
    email: (user && user.email) || '',
    username: (user && user.username) || '',
    userId: (user && user.userId) || '',
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

  for (let i = 0; i < scenarioNames.length; i++) {
    const name = scenarioNames[i];
    const scenario = registry[name];

    ctx.step = stepLookup(plan, name);
    console.log(`[${flow.flowId}] >>> scenario ${i + 1}/${scenarioNames.length}: ${name}`);

    const ok = scenario.run(ctx);
    syncFlow(flow, ctx.data);

    if (!ok) {
      failedAt = name;
      break;
    }
  }

  skipUnrecorded(
    flow,
    plan,
    failedAt ? `skipped after scenario "${failedAt}" failed` : 'not reached'
  );
  finalizeUserFlow(flow, plan);

  return flow;
}
