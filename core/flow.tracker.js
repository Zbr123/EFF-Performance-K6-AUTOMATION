import { check } from 'k6';
import { categoryLabel, classifyFailure } from './errors.classifier.js';
import { usersAllPassed, usersCompleted, usersPartialFail } from './metrics.registry.js';
import { iterNum, safeTag, checkText, backendText } from '../utils/format.util.js';

function emitTransportCheck(line) {
  check(null, { [line]: () => true });
}

export function createUserFlow(id) {
  return {
    flowId: `VU${__VU}-IT${__ITER}`,
    vu: __VU,
    iter: iterNum(),
    email: id.email || '',
    username: id.username || '',
    userId: id.userId || '',
    blitzLeagueId: '',
    blitzLeagueName: '',
    blitzTeamId: '',
    blitzTeamName: '',
    blitzInviteCode: '',
    blitzJoinedLeagueId: '',
    blitzLineupWeek: '',
    steps: [],
  };
}

export function recordStep(flow, stepDef, status, respObj, skipReason) {
  let category = 'ok';
  let code = 'OK';
  let message = 'step passed';
  let httpStatus = (respObj && respObj.res && respObj.res.status != null) ? respObj.res.status : '-';

  if (status === 'SKIP') {
    category = 'skipped';
    code = 'SKIPPED';
    message = skipReason || 'skipped because a previous step failed';
    httpStatus = '-';
  } else if (status === 'FAIL') {
    const info = classifyFailure(respObj);
    category = info.category;
    code = info.code;
    message = backendText(respObj) || info.message;
    httpStatus = info.httpStatus;
  }

  const step = {
    num: stepDef.num,
    key: stepDef.key,
    label: stepDef.label,
    status,
    category,
    categoryLabel: categoryLabel(category),
    code: String(code || ''),
    httpStatus: String(httpStatus),
    message: String(message || ''),
  };
  flow.steps.push(step);

  const line =
    `[STEP] vu=${flow.vu}|iter=${flow.iter}|email=${safeTag(flow.email, 70)}` +
    `|user=${safeTag(flow.username, 30)}|num=${step.num}|key=${step.key}` +
    `|status=${step.status}|cat=${step.category}|code=${safeTag(step.code, 40)}` +
    `|http=${step.httpStatus}|label=${safeTag(step.label, 80)}|reason=${checkText(step.message)}`;
  emitTransportCheck(line);

  console.log(`[${flow.flowId}] --- STEP ${step.num}: ${step.label} -> ${step.status} ---`);
  if (step.status !== 'PASS') {
    console.log(
      `[${flow.flowId}]     reason=${step.categoryLabel} | code=${step.code} | http=${step.httpStatus} | ${step.message}`
    );
  }
  if (respObj && respObj.body) {
    console.log(`[${flow.flowId}]     RESPONSE: ${JSON.stringify(respObj.body)}`);
  }
}

export function finalizeUserFlow(flow, steps) {
  const passed = flow.steps.filter((s) => s.status === 'PASS').length;
  const failed = flow.steps.filter((s) => s.status === 'FAIL').length;
  const skipped = flow.steps.filter((s) => s.status === 'SKIP').length;
  const total = (steps && steps.length) || flow.steps.length;
  const result = failed === 0 && skipped === 0 ? 'ALL_PASS' : (passed === 0 ? 'ALL_FAIL' : 'PARTIAL');

  usersCompleted.add(1);
  if (result === 'ALL_PASS') usersAllPassed.add(1);
  else usersPartialFail.add(1);

  const line =
    `[USER] vu=${flow.vu}|iter=${flow.iter}|email=${safeTag(flow.email, 70)}` +
    `|user=${safeTag(flow.username, 30)}|userId=${safeTag(flow.userId, 20)}` +
    `|blitzLeagueId=${safeTag(flow.blitzLeagueId, 20)}` +
    `|blitzLeagueName=${safeTag(flow.blitzLeagueName, 50)}` +
    `|blitzTeamId=${safeTag(flow.blitzTeamId, 20)}` +
    `|blitzTeamName=${safeTag(flow.blitzTeamName, 50)}` +
    `|blitzInviteCode=${safeTag(flow.blitzInviteCode, 20)}` +
    `|blitzJoinedLeagueId=${safeTag(flow.blitzJoinedLeagueId, 20)}` +
    `|blitzLineupWeek=${safeTag(flow.blitzLineupWeek, 8)}` +
    `|pass=${passed}|fail=${failed}|skip=${skipped}|total=${total}|result=${result}`;
  emitTransportCheck(line);

  console.log(`[${flow.flowId}] ------------------------------------------------------------`);
  console.log(
    `[${flow.flowId}] USER SUMMARY email=${flow.email} | passed=${passed}/${total} | failed=${failed} | skipped=${skipped} | result=${result}`
  );
  flow.steps.forEach((s) => {
    console.log(
      `[${flow.flowId}]   ${s.num}. ${s.label}: ${s.status}` +
      (s.status === 'PASS' ? '' : ` [${s.categoryLabel}] ${s.code} — ${s.message}`)
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
