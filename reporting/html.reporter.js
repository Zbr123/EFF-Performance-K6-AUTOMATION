import { categoryLabel, explainErrorCause } from '../core/errors.classifier.js';
import { PASSWORD, REPORT_DIR, SUITE, TOTAL_ITERATIONS, VUS } from '../config/env.config.js';
import { INIT_POOL, mergePool, removeFromPool, RESOLVED_POOL_PATH } from '../pool/user.pool.js';
import { textSummary } from './text.reporter.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseKv(line) {
  const out = {};
  String(line || '').split('|').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = v;
  });
  return out;
}

export function parseUserFlows(data) {
  const checks = (data.root_group && data.root_group.checks) || [];
  const users = [];
  const stepsByKey = {};

  checks.forEach((c) => {
    const name = c.name || '';
    if (name.startsWith('[USER] ')) {
      const kv = parseKv(name.replace('[USER] ', ''));
      const key = `${kv.vu || ''}-${kv.iter || ''}-${kv.email || ''}`;
      users.push({
        key,
        vu: Number(kv.vu) || null,
        iter: Number(kv.iter) || null,
        email: kv.email || '',
        username: kv.user || '',
        userId: kv.userId || '',
        passed: Number(kv.pass) || 0,
        failed: Number(kv.fail) || 0,
        skipped: Number(kv.skip) || 0,
        total: Number(kv.total) || 0,
        result: kv.result || 'UNKNOWN',
        steps: [],
      });
    } else if (name.startsWith('[STEP] ')) {
      const kv = parseKv(name.replace('[STEP] ', ''));
      const key = `${kv.vu || ''}-${kv.iter || ''}-${kv.email || ''}`;
      if (!stepsByKey[key]) stepsByKey[key] = [];
      stepsByKey[key].push({
        num: Number(kv.num) || 0,
        key: kv.key || '',
        status: kv.status || '',
        category: kv.cat || '',
        categoryLabel: categoryLabel(kv.cat || 'unknown'),
        code: kv.code || '',
        httpStatus: kv.http || '',
        message: kv.reason || '',
        label: kv.key || '',
      });
    }
  });

  users.forEach((u) => {
    u.steps = (stepsByKey[u.key] || []).sort((a, b) => a.num - b.num);
  });

  users.sort((a, b) => {
    if ((a.vu || 0) !== (b.vu || 0)) return (a.vu || 0) - (b.vu || 0);
    return (a.iter || 0) - (b.iter || 0);
  });

  return users;
}

function parseErrorChecks(data, kindPrefix) {
  const checks = (data.root_group && data.root_group.checks) || [];
  const rows = [];
  const byEndpointCode = {};

  checks.forEach((c) => {
    const name = c.name || '';
    if (!name.startsWith(kindPrefix)) return;
    if (!c.fails) return;

    const parts = name.split(' | ').map((p) => p.trim());
    const endpoint = (parts[0] || '').replace(kindPrefix, '').trim();
    const status = (parts.find((p) => p.startsWith('status=')) || 'status=n/a').replace('status=', '');
    const code = (parts.find((p) => p.startsWith('code=')) || 'code=n/a').replace('code=', '');
    const vu = Number((parts.find((p) => p.startsWith('VU=')) || 'VU=').replace('VU=', '')) || null;
    const iter = Number((parts.find((p) => p.startsWith('iter=')) || 'iter=').replace('iter=', '')) || null;
    const message = parts.slice(5).join(' | ') || '';
    const cause = explainErrorCause(code, message);

    rows.push({ endpoint, http_status: status, error_code: code, count: c.fails, vu, iter, message, cause });

    const key = `${endpoint}||${code}`;
    if (!byEndpointCode[key]) {
      byEndpointCode[key] = { endpoint, http_status: status, error_code: code, count: 0, firstIter: iter, message, cause };
    }
    byEndpointCode[key].count += c.fails;
  });

  return {
    rows: rows.sort((a, b) => (a.iter || 0) - (b.iter || 0)),
    summary: Object.values(byEndpointCode).sort((a, b) => b.count - a.count),
  };
}

function statusBadge(status) {
  const color = status === 'PASS' ? '#166534' : status === 'FAIL' ? '#991b1b' : '#6b7280';
  return `<span style="color:${color};font-weight:700;">${esc(status)}</span>`;
}

function resultBadge(result) {
  const color = result === 'ALL_PASS' ? '#166534' : result === 'ALL_FAIL' ? '#991b1b' : '#9a3412';
  return `<span style="color:${color};font-weight:700;">${esc(result)}</span>`;
}

function buildUserReportHtml(users) {
  const allPass = users.filter((u) => u.result === 'ALL_PASS').length;
  const partial = users.length - allPass;

  const summaryRows = users.map((u) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">VU ${esc(u.vu)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">iter ${esc(u.iter)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:Consolas,monospace;font-size:12px;">${esc(u.email)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(u.username)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(u.userId || '-')}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#166534;font-weight:700;">${u.passed}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#991b1b;font-weight:700;">${u.failed}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${u.skipped}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${resultBadge(u.result)}</td>
    </tr>`).join('');

  const detailBlocks = users.map((u) => {
    const stepRows = (u.steps || []).map((s) => {
      const cause = (s.status === 'FAIL' || s.status === 'SKIP') ? explainErrorCause(s.code, s.message) : '-';
      return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${s.num}. ${esc(s.label || s.key)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${statusBadge(s.status)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(s.categoryLabel)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(s.code || '-')}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(s.httpStatus || '-')}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${esc(s.message || '-')}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${esc(cause)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" style="padding:10px;color:#6b7280;">No step details</td></tr>`;

    return `
    <div style="margin:0 0 18px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="padding:12px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
        <b>VU ${esc(u.vu)}</b> · iter ${esc(u.iter)} ·
        <span style="font-family:Consolas,monospace;font-size:12px;">${esc(u.email)}</span>
        · ${resultBadge(u.result)}
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#eff6ff;text-align:left;">
            <th style="padding:8px;">Step</th>
            <th style="padding:8px;">Status</th>
            <th style="padding:8px;">Failure Type</th>
            <th style="padding:8px;">Error Code</th>
            <th style="padding:8px;">HTTP</th>
            <th style="padding:8px;">Reason</th>
            <th style="padding:8px;">Likely Cause</th>
          </tr>
        </thead>
        <tbody>${stepRows}</tbody>
      </table>
    </div>`;
  }).join('');

  return `
  <div style="max-width:1400px;margin:0 auto 24px auto;font-family:Segoe UI,Arial,sans-serif;background:#fff;border-radius:16px;padding:20px;">
    <div style="margin:0 0 18px 0;padding:16px 20px;background:#eff6ff;border:1px solid #2563eb;border-radius:10px;">
      <h1 style="margin:0 0 8px 0;color:#1d4ed8;font-size:22px;">EFF k6 Framework — ${esc(SUITE)}</h1>
      <p style="margin:0;color:#111827;"><b>Config:</b> VUs=${VUS}, Iterations=${TOTAL_ITERATIONS}</p>
      <p style="margin:8px 0 0 0;color:#1e3a8a;">
        Users: <b>${users.length}</b>
        &nbsp;|&nbsp; All passed: <b style="color:#166534;">${allPass}</b>
        &nbsp;|&nbsp; With failures/skips: <b style="color:#9a3412;">${partial}</b>
      </p>
    </div>
    <h2 style="margin:0 0 10px 0;color:#1d4ed8;">A) All Users — Quick Summary</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:22px;border:1px solid #e5e7eb;">
      <thead>
        <tr style="background:#dbeafe;text-align:left;">
          <th style="padding:8px;">VU</th>
          <th style="padding:8px;">Iteration</th>
          <th style="padding:8px;">Email</th>
          <th style="padding:8px;">Username</th>
          <th style="padding:8px;">User ID</th>
          <th style="padding:8px;">Pass</th>
          <th style="padding:8px;">Fail</th>
          <th style="padding:8px;">Skip</th>
          <th style="padding:8px;">Result</th>
        </tr>
      </thead>
      <tbody>${summaryRows || '<tr><td colspan="9" style="padding:10px;">No users captured</td></tr>'}</tbody>
    </table>
    <h2 style="margin:0 0 10px 0;color:#1d4ed8;">B) Per User — Step Details</h2>
    ${detailBlocks || '<p>No step details</p>'}
  </div>`;
}

function errorTablesHtml(data) {
  const five = parseErrorChecks(data, '[5xx] ');
  const api = parseErrorChecks(data, '[API] ');
  const rowHtml = (rows) => rows.map((r) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(r.endpoint)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(r.http_status)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(r.error_code)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${esc(r.count)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">VU ${esc(r.vu)} / iter ${esc(r.iter)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${esc(r.message)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${esc(r.cause)}</td>
    </tr>`).join('');

  return `
  <div style="max-width:1400px;margin:0 auto 24px auto;font-family:Segoe UI,Arial,sans-serif;background:#fff;border-radius:16px;padding:20px;">
    <h2 style="margin:0 0 10px 0;color:#9a3412;">Errors — 5xx (${five.rows.length})</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:22px;border:1px solid #e5e7eb;">
      <thead>
        <tr style="background:#ffedd5;text-align:left;">
          <th style="padding:8px;">Endpoint</th><th style="padding:8px;">HTTP</th>
          <th style="padding:8px;">Code</th><th style="padding:8px;">Count</th>
          <th style="padding:8px;">VU / Iter</th><th style="padding:8px;">Message</th>
          <th style="padding:8px;">Likely Cause</th>
        </tr>
      </thead>
      <tbody>${rowHtml(five.rows) || '<tr><td colspan="7" style="padding:10px;">None</td></tr>'}</tbody>
    </table>
    <h2 style="margin:0 0 10px 0;color:#9a3412;">Errors — API / business (${api.rows.length})</h2>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
      <thead>
        <tr style="background:#fed7aa;text-align:left;">
          <th style="padding:8px;">Endpoint</th><th style="padding:8px;">HTTP</th>
          <th style="padding:8px;">Code</th><th style="padding:8px;">Count</th>
          <th style="padding:8px;">VU / Iter</th><th style="padding:8px;">Message</th>
          <th style="padding:8px;">Likely Cause</th>
        </tr>
      </thead>
      <tbody>${rowHtml(api.rows) || '<tr><td colspan="7" style="padding:10px;">None</td></tr>'}</tbody>
    </table>
  </div>`;
}

export function handleSummary(data, suite) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const htmlPath = `${REPORT_DIR}/${SUITE}-report-${stamp}.html`;
  const jsonPath = `${REPORT_DIR}/${SUITE}-report-${stamp}.json`;
  const latestPath = `${REPORT_DIR}/${SUITE}-report-latest.html`;
  const usersJsonPath = `${REPORT_DIR}/${SUITE}-users-${stamp}.json`;

  const users = parseUserFlows(data);
  const userReport = buildUserReportHtml(users);
  const errorsHtml = errorTablesHtml(data);
  const mergedHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>EFF k6 — ${SUITE}</title></head>
<body style="background:#e5e7eb;padding:16px;">
${userReport}${errorsHtml}
</body></html>`;

  const files = {
    [htmlPath]: mergedHtml,
    [latestPath]: mergedHtml,
    [jsonPath]: JSON.stringify(data, null, 2),
    [usersJsonPath]: JSON.stringify({ generatedAt: new Date().toISOString(), suite: SUITE, vus: VUS, iterations: TOTAL_ITERATIONS, users }, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };

  if (suite && suite.writePool) {
    const updated = suite.removeFromPool
      ? removeFromPool(INIT_POOL.users, users, INIT_POOL.password || PASSWORD)
      : mergePool(INIT_POOL.users, users, INIT_POOL.password || PASSWORD);
    files[RESOLVED_POOL_PATH] = JSON.stringify(updated, null, 2);
    const verb = suite.removeFromPool ? 'cleaned' : 'written';
    console.log(`User pool ${verb}: ${RESOLVED_POOL_PATH} (${updated.users.length} users remaining)`);
  }

  console.log(`\nHTML report: ${htmlPath}`);
  console.log(`HTML report (latest): ${latestPath}`);
  console.log(`Users JSON: ${usersJsonPath}\n`);

  return files;
}
