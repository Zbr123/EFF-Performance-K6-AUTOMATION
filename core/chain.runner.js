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
    data: {
      email: (user && user.email) || '',
      username: (user && user.username) || '',
      userId: (user && user.userId) || '',
      token: '',
    },
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

    flow.email = ctx.data.email || flow.email;
    flow.username = ctx.data.username || flow.username;
    flow.userId = ctx.data.userId || flow.userId;

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
