import { check } from 'k6';
import { LOG_RESPONSE_BODIES } from '../config/env.config.js';
import { FLOW_FIELDS, FLOW_SUMMARY_FIELDS } from './flow.fields.js';
import { categoryLabel, classifyFailure } from './errors.classifier.js';
import { businessErrors, errorAtIteration, errorAtVu, usersAllPassed, usersCompleted, usersPartialFail } from './metrics.registry.js';
import { iterNum, safeTag, checkText, backendText } from '../utils/format.util.js';

function emitTransportCheck(line) {
  check(null, { [line]: () => true });
}

function emitBusinessRuleCheck(stepName, code, message) {
  const tags = {
    endpoint: safeTag(stepName, 40),
    http_status: 'n/a',
    error_code: safeTag(code || 'BUSINESS_RULE', 40),
    message: safeTag(message || '', 100),
  };
  const n = iterNum();
  businessErrors.add(1, tags);
  errorAtIteration.add(n, { endpoint: tags.endpoint, kind: 'business' });
  errorAtVu.add(__VU, { endpoint: tags.endpoint, kind: 'business' });
  const detailCheck =
    `[BUSINESS] ${stepName} | status=n/a | code=${code || 'BUSINESS_RULE'} | VU=${__VU} | iter=${n} | ${checkText(message || '')}`;
  check(null, { [detailCheck]: () => false });
}

function businessSkipCode(reason) {
  const text = String(reason || '').toLowerCase();
  if (text.indexOf('no sellable asset') >= 0) return 'NO_SELLABLE_ASSET';
  if (text.indexOf('no affordable') >= 0 || text.indexOf('no eligible') >= 0) return 'NO_BUYABLE_ASSET';
  if (text.indexOf('cash balance') >= 0) return 'CASH_UNAVAILABLE';
  if (text.indexOf('transaction limit') >= 0) return 'TRANSACTION_LIMIT_REACHED';
  if (text.indexOf('transaction state') >= 0) return 'TRANSACTION_STATE_UNAVAILABLE';
  if (text.indexOf('no unused selectable') >= 0) return 'NO_UNUSED_SELECTABLE_ASSET';
  if (text.indexOf('no league details view') >= 0) return 'NO_LEAGUE_DETAILS_VIEW';
  if (text.indexOf('no results week') >= 0) return 'NO_RESULTS_WEEK';
  return 'BUSINESS_SKIP';
}

function skipFailureType(reason) {
  const text = String(reason || '').toLowerCase();
  if (text.indexOf('not reached') >= 0) return 'Skipped: not reached';
  if (
    text.indexOf('earlier step') >= 0 ||
    text.indexOf('previous step') >= 0 ||
    text.indexOf('scenario') >= 0 ||
    (text.indexOf('skipped because') >= 0 && text.indexOf('failed') >= 0)
  ) return 'Skipped: earlier step failed';
  return 'Skipped';
}

function failureType(category, status, businessCondition, skipReason) {
  if (status === 'PASS') return 'OK';
  if (businessCondition) return 'Business condition';
  if (status === 'SKIP') return skipFailureType(skipReason);
  return categoryLabel(category);
}

export function createUserFlow(id) {
  const flow = {
    flowId: `VU${__VU}-IT${__ITER}`,
    vu: __VU,
    iter: iterNum(),
    steps: [],
  };
  for (let i = 0; i < FLOW_FIELDS.length; i++) flow[FLOW_FIELDS[i]] = '';
  flow.email = id.email || '';
  flow.username = id.username || '';
  flow.userId = id.userId || '';
  flow.exchangeLeagueId = id.exchangeLeagueId || '';
  flow.exchangeLeagueName = id.exchangeLeagueName || '';
  flow.exchangeTeamId = id.exchangeTeamId || '';
  flow.exchangeTeamName = id.exchangeTeamName || '';
  flow.exchangeInviteCode = id.exchangeInviteCode || '';
  flow.exchangeJoinedLeagueId = id.exchangeJoinedLeagueId || '';
  flow.exchangeJoinedTeamId = id.exchangeJoinedTeamId || '';
  flow.exchangeJoinedTeamName = id.exchangeJoinedTeamName || '';
  return flow;
}

export function recordStep(flow, stepDef, status, respObj, skipReason, skipType) {
  let category = 'ok';
  let code = 'OK';
  let message = 'step passed';
  let httpStatus = (respObj && respObj.res && respObj.res.status != null) ? respObj.res.status : '-';
  const businessCondition = status === 'SKIP' && skipType === 'business';

  if (status === 'SKIP') {
    if (businessCondition) {
      category = 'business_rule';
      code = businessSkipCode(skipReason);
      message = skipReason || 'business condition prevented this step';
    } else {
      category = 'skipped';
      code = 'SKIPPED';
      message = skipReason || 'skipped because a previous step failed';
    }
    httpStatus = '-';
  } else if (status === 'FAIL') {
    const info = classifyFailure(respObj);
    category = info.category;
    code = info.code;
    message = backendText(respObj) || info.message;
    httpStatus = info.httpStatus;
    if (
      skipReason &&
      respObj &&
      !respObj.gqlErr &&
      !respObj.is5xx &&
      respObj.res &&
      respObj.res.status === 200
    ) {
      message = skipReason;
      if (!code || code === 'UNKNOWN') code = 'VALIDATION';
    }
  }

  const stepFailureType = failureType(category, status, businessCondition, skipReason);
  const step = {
    num: stepDef.num,
    key: stepDef.key,
    label: stepDef.label,
    status,
    category,
    categoryLabel: categoryLabel(category),
    failureType: stepFailureType,
    code: String(code || ''),
    httpStatus: String(httpStatus),
    message: String(message || ''),
    businessCondition,
  };
  flow.steps.push(step);

  const durPart = respObj && respObj.res && respObj.res.timings && respObj.res.timings.duration != null
    ? `|dur=${Math.round(Number(respObj.res.timings.duration))}`
    : '';
  const line =
    `[STEP] vu=${flow.vu}|iter=${flow.iter}|email=${safeTag(flow.email, 70)}` +
    `|user=${safeTag(flow.username, 30)}|num=${step.num}|key=${step.key}` +
    `|status=${step.status}|cat=${step.category}|failureType=${safeTag(step.failureType, 80)}` +
    `|code=${safeTag(step.code, 40)}` +
    `|http=${step.httpStatus}|label=${safeTag(step.label, 80)}` +
    `|recovered=${step.recovered ? '1' : '0'}|businessRule=${step.businessRule ? '1' : '0'}` +
    `|businessCondition=${step.businessCondition ? '1' : '0'}` +
    durPart +
    `|reason=${checkText(step.message)}`;
  emitTransportCheck(line);
  if (businessCondition) {
    emitBusinessRuleCheck(stepDef.label || stepDef.key, step.code, step.message);
  }

  console.log(`[${flow.flowId}] --- STEP ${step.num}: ${step.label} -> ${step.status} ---`);
  if (step.status !== 'PASS') {
    console.log(
      `[${flow.flowId}]     reason=${step.failureType || step.categoryLabel} | code=${step.code} | http=${step.httpStatus} | ${step.message}`
    );
  }
  if (respObj && respObj.body && LOG_RESPONSE_BODIES) {
    console.log(`[${flow.flowId}]     RESPONSE: ${JSON.stringify(respObj.body)}`);
  }
}

export function recordBusinessRule(flow, stepDef, code, message) {
  const step = {
    num: stepDef.num,
    key: stepDef.key,
    label: stepDef.label,
    status: 'FAIL',
    category: 'business_rule',
    categoryLabel: categoryLabel('business_rule'),
    failureType: 'Business rule',
    code: String(code || 'BUSINESS_RULE'),
    httpStatus: 'n/a',
    message: String(message || ''),
    businessRule: true,
  };
  flow.steps.push(step);

  const line =
    `[STEP] vu=${flow.vu}|iter=${flow.iter}|email=${safeTag(flow.email, 70)}` +
    `|user=${safeTag(flow.username, 30)}|num=${step.num}|key=${step.key}` +
    `|status=${step.status}|cat=${step.category}|failureType=${safeTag(step.failureType, 80)}` +
    `|code=${safeTag(step.code, 40)}` +
    `|http=${step.httpStatus}|label=${safeTag(step.label, 80)}` +
    `|recovered=${step.recovered ? '1' : '0'}|businessRule=${step.businessRule ? '1' : '0'}` +
    `|businessCondition=${step.businessCondition ? '1' : '0'}` +
    `|reason=${checkText(step.message)}`;
  emitTransportCheck(line);
  emitBusinessRuleCheck(stepDef.label || stepDef.key, step.code, step.message);

  console.log(`[${flow.flowId}] --- STEP ${step.num}: ${step.label} -> FAIL [business rule] ---`);
  console.log(
    `[${flow.flowId}]     reason=${step.failureType || step.categoryLabel} | code=${step.code} | ${step.message}`
  );
}

export function finalizeUserFlow(flow, steps) {
  const passed = flow.steps.filter((s) => s.status === 'PASS').length;
  const recovered = flow.steps.filter((s) => s.status === 'FAIL' && s.recovered).length;
  const businessRule = flow.steps.filter((s) => s.status === 'FAIL' && s.businessRule).length;
  const failed = flow.steps.filter(
    (s) => s.status === 'FAIL' && !s.recovered && !s.businessRule
  ).length;
  const skipped = flow.steps.filter((s) => s.status === 'SKIP').length;
  const total = flow.steps.length || (steps && steps.length) || 0;
  const result =
    failed === 0 && skipped === 0
      ? 'ALL_PASS'
      : passed === 0 && recovered === 0 && businessRule === 0
        ? 'ALL_FAIL'
        : 'PARTIAL';

  usersCompleted.add(1);
  if (result === 'ALL_PASS') usersAllPassed.add(1);
  else usersPartialFail.add(1);

  const summaryFields = FLOW_SUMMARY_FIELDS.map((field) => {
    const key = field.key === 'username' ? 'user' : field.key;
    return `${key}=${safeTag(flow[field.key], field.max)}`;
  }).join('|');
  const line =
    `[USER] vu=${flow.vu}|iter=${flow.iter}|${summaryFields}` +
    `|pass=${passed}|fail=${failed}|skip=${skipped}|recovered=${recovered + businessRule}|total=${total}|result=${result}`;
  emitTransportCheck(line);

  console.log(`[${flow.flowId}] ------------------------------------------------------------`);
  console.log(
    `[${flow.flowId}] USER SUMMARY email=${flow.email} | passed=${passed}/${total} | failed=${failed} | businessRule=${businessRule} | recovered=${recovered} | skipped=${skipped} | result=${result}`
  );
  flow.steps.forEach((s) => {
    if (s.status === 'PASS' && failed === 0) return;
    console.log(
      `[${flow.flowId}]   ${s.num}. ${s.label}: ${s.status}` +
      (s.status === 'PASS' ? '' : ` [${s.failureType || s.categoryLabel}] ${s.code} — ${s.message}`) +
      (s.recovered ? ' [recovered]' : '') +
      (s.businessRule ? ' [business rule]' : '') +
      (s.businessCondition ? ' [business condition]' : '')
    );
  });
  console.log(`===== END FLOW ${flow.flowId} =====\n`);

  return { passed, failed, skipped, total, result };
}

export function stepPassed(resp, dataOk) {
  return check(resp, {
    'http 200': () => resp.res && resp.res.status === 200,
    'no 5xx': () => !resp.is5xx,
    'payload ok': () => !!dataOk,
  });
}
