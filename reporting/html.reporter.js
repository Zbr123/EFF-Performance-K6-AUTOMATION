import { categoryLabel, explainErrorCause } from '../core/errors.classifier.js';
import { PASSWORD, REPORT_DIR, SUITE, TOTAL_ITERATIONS, VUS } from '../config/env.config.js';
import { suiteReportGroup, suiteReportLeaf } from '../config/suites.config.js';
import { INIT_POOL, mergePool, removeFromPool, RESOLVED_POOL_PATH } from '../pool/user.pool.js';
import { FLOW_SUMMARY_FIELDS } from '../core/flow.fields.js';
import { textSummary } from './text.reporter.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stepName(key) {
  const raw = String(key || '');
  const dot = raw.indexOf('.');
  return dot >= 0 ? raw.slice(dot + 1) : raw;
}

function parseKv(line) {
  const out = {};
  String(line || '').split('|').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = v === 'unknown' ? '' : v;
  });
  return out;
}

function parseUserFlows(data) {
  const checks = (data.root_group && data.root_group.checks) || [];
  const users = [];
  const stepsByKey = {};

  checks.forEach((c) => {
    const name = c.name || '';
    if (name.startsWith('[USER] ')) {
      const kv = parseKv(name.replace('[USER] ', ''));
      const key = `${kv.vu || ''}-${kv.iter || ''}-${kv.email || ''}`;
      const u = { key, vu: Number(kv.vu) || null, iter: Number(kv.iter) || null,
        email: kv.email || '', passed: Number(kv.pass) || 0, failed: Number(kv.fail) || 0,
        skipped: Number(kv.skip) || 0, recovered: Number(kv.recovered) || 0,
        total: Number(kv.total) || 0, result: kv.result || 'UNKNOWN', steps: [] };
      FLOW_SUMMARY_FIELDS.forEach((field) => {
        const kvKey = field.key === 'username' ? 'user' : field.key;
        u[field.key] = kv[kvKey] || '';
      });
      users.push(u);
    } else if (name.startsWith('[STEP] ')) {
      const raw = name.replace('[STEP] ', '');
      const reasonAt = raw.indexOf('|reason=');
      const head = reasonAt >= 0 ? raw.slice(0, reasonAt) : raw;
      const reason = reasonAt >= 0 ? raw.slice(reasonAt + 8) : '';
      const kv = parseKv(head);
      const key = `${kv.vu || ''}-${kv.iter || ''}-${kv.email || ''}`;
      if (!stepsByKey[key]) stepsByKey[key] = [];
      stepsByKey[key].push({
        num: Number(kv.num) || 0,
        key: kv.key || '',
        status: kv.status || '',
        dur: kv.dur != null && kv.dur !== '' && isFinite(Number(kv.dur)) ? Math.round(Number(kv.dur)) : null,
        category: kv.cat || '',
        categoryLabel: categoryLabel(kv.cat || 'unknown'),
        failureType: kv.failureType || categoryLabel(kv.cat || 'unknown'),
        code: kv.code || '',
        httpStatus: kv.http || '',
        message: reason,
        recovered: kv.recovered === '1',
        businessRule: kv.businessRule === '1',
        businessCondition: kv.businessCondition === '1',
        label: kv.label || stepName(kv.key),
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

function parseErrorChecks(data, kindPrefixes) {
  const checks = (data.root_group && data.root_group.checks) || [];
  const prefixes = Array.isArray(kindPrefixes) ? kindPrefixes : [kindPrefixes];
  const rows = [];

  checks.forEach((c) => {
    const name = c.name || '';
    const prefix = prefixes.find((candidate) => name.startsWith(candidate));
    if (!prefix || !c.fails) return;

    const parts = name.split(' | ').map((p) => p.trim());
    const endpoint = (parts[0] || '').replace(prefix, '').trim();
    const status = (parts.find((p) => p.startsWith('status=')) || 'status=n/a').replace('status=', '');
    const code = (parts.find((p) => p.startsWith('code=')) || 'code=n/a').replace('code=', '');
    const vu = Number((parts.find((p) => p.startsWith('VU=')) || 'VU=').replace('VU=', '')) || null;
    const iter = Number((parts.find((p) => p.startsWith('iter=')) || 'iter=').replace('iter=', '')) || null;
    const message = parts.slice(5).join(' | ') || '';
    const cause = explainErrorCause(code, message);

    rows.push({ endpoint, http_status: status, error_code: code, count: c.fails, vu, iter, message, cause });
  });

  return { rows: rows.sort((a, b) => (a.iter || 0) - (b.iter || 0)) };
}

function statusBadge(status) {
  const map = {
    PASS: ['#dcfce7', '#166534'],
    FAIL: ['#fee2e2', '#991b1b'],
    SKIP: ['#f3f4f6', '#6b7280'],
  };
  const [bg, fg] = map[status] || ['#f3f4f6', '#6b7280'];
  return `<span style="background:${bg};color:${fg};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">${esc(status)}</span>`;
}

function resultBadge(result) {
  const map = {
    ALL_PASS: ['#dcfce7', '#166534', 'ALL PASS'],
    ALL_FAIL: ['#fee2e2', '#991b1b', 'ALL FAIL'],
    PARTIAL:  ['#fef3c7', '#92400e', 'PARTIAL'],
  };
  const [bg, fg, label] = map[result] || ['#f3f4f6', '#6b7280', result];
  return `<span style="background:${bg};color:${fg};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">${label}</span>`;
}

function buildFlowStats(users) {
  const stats = {};
  users.forEach((u) => {
    (u.steps || []).forEach((s) => {
      const name = s.label || stepName(s.key);
      const key  = `${s.num}__${name}`;
      if (!stats[key]) stats[key] = { num: s.num, name, pass: 0, fail: 0, skip: 0 };
      if (s.status === 'PASS')      stats[key].pass++;
      else if (s.status === 'FAIL') stats[key].fail++;
      else if (s.status === 'SKIP') stats[key].skip++;
    });
  });
  return Object.values(stats).sort((a, b) => a.num - b.num);
}

function detailValue(value) {
  return value == null || value === '' ? '-' : String(value);
}

function pairDetail(first, second) {
  if ((first == null || first === '') && (second == null || second === '')) return '';
  return `${detailValue(first)} (${detailValue(second)})`;
}

function dataRows(rows) {
  return rows
    .filter((row) => row[1] != null && row[1] !== '' && row[1] !== '-')
    .map((row) => `<tr><td style="font-weight:600;color:#374151;">${esc(row[0])}</td><td class="msg-cell">${esc(row[1])}</td></tr>`)
    .join('');
}

function dataPanel(title, rows) {
  const body = dataRows(rows);
  if (!body) return '';
  return `
    <div class="flow-data-panel" style="padding:12px;border:1px solid #dbeafe;border-radius:8px;background:#eff6ff;">
      <div style="font-size:12px;font-weight:700;color:#1d4ed8;margin-bottom:6px;">${esc(title)}</div>
      <table><tbody>${body}</tbody></table>
    </div>`;
}

function buildBlitzDataPanel(u) {
  return dataPanel('Blitz flow data', [
    ['League', pairDetail(u.blitzLeagueName, u.blitzLeagueId)],
    ['Members', detailValue(u.blitzLeagueMembers)],
    ['Joined league', detailValue(u.blitzJoinedLeagueId)],
    ['Team', pairDetail(u.blitzTeamName, u.blitzTeamId)],
    ['Joined team', pairDetail(u.blitzJoinedTeamName, u.blitzJoinedTeamId)],
    ['Lineup week', detailValue(u.blitzLineupWeek)],
    ['Lineup status', detailValue(u.blitzLineupStatus)],
    ['Week points', detailValue(u.blitzLineupTotalWeekPoints)],
    ['Season points', detailValue(u.blitzLineupTotalSeasonPoints)],
    ['Lineup rank', detailValue(u.blitzLineupRank)],
    ['QB', detailValue(u.blitzLineupQB)],
    ['RB1', detailValue(u.blitzLineupRB1)],
    ['RB2', detailValue(u.blitzLineupRB2)],
    ['WR1', detailValue(u.blitzLineupWR1)],
    ['WR2', detailValue(u.blitzLineupWR2)],
    ['TE', detailValue(u.blitzLineupTE)],
    ['K', detailValue(u.blitzLineupK)],
    ['OFF', detailValue(u.blitzLineupOFF)],
    ['DEF', detailValue(u.blitzLineupDEF)],
    ['Standings view', detailValue(u.blitzDetailsView)],
    ['Standings teams', detailValue(u.blitzDetailsTeamCount)],
    ['Standings leader', detailValue(u.blitzDetailsTopTeam)],
    ['Results week', detailValue(u.blitzLineupWeek)],
    ['Results teams', detailValue(u.blitzResultsTeamCount)],
    ['Results leader', detailValue(u.blitzResultsLeader)],
    ['Own result rank', detailValue(u.blitzResultsOwnRank)],
    ['Own result points', detailValue(u.blitzResultsOwnPoints)],
  ]);
}

function buildExchangeDataPanel(u) {
  return dataPanel('Exchange flow data', [
    ['League', pairDetail(u.exchangeLeagueName, u.exchangeLeagueId)],
    ['Joined league', detailValue(u.exchangeJoinedLeagueId)],
    ['Team', pairDetail(u.exchangeTeamName, u.exchangeTeamId)],
    ['Joined team', pairDetail(u.exchangeJoinedTeamName, u.exchangeJoinedTeamId)],
    ['Portfolio week', detailValue(u.exchangePortfolioWeek)],
    ['Asset count', detailValue(u.exchangePortfolioAssetCount)],
    ['Cash on hand', detailValue(u.exchangePortfolioCash)],
    ['Assets value', detailValue(u.exchangePortfolioAssetsValue)],
    ['Total value', detailValue(u.exchangePortfolioTotalValue)],
    ['Transactions used', detailValue(u.exchangePortfolioTransactionsUsed)],
    ['Transactions remaining', detailValue(u.exchangePortfolioTransactionsRemaining)],
    ['Transaction limit', detailValue(u.exchangePortfolioTransactionLimit)],
    ['Preseason transactions', detailValue(u.exchangePortfolioPreseasonTransactions)],
    ['Total transactions', detailValue(u.exchangePortfolioTotalTransactions)],
    ['Portfolio before', detailValue(u.exchangePortfolioBefore)],
    ['Portfolio after', detailValue(u.exchangePortfolioAfter)],
    ['Buy asset', detailValue(u.exchangeBuyAssetDescription)],
    ['Buy asset ID/type', pairDetail(u.exchangeBuyAssetId, u.exchangeBuyAssetType)],
    ['Buy price', detailValue(u.exchangeBuyAssetPrice)],
    ['Buy candidates', detailValue(u.exchangeBuyAssetCandidates)],
    ['Buy response asset ID', detailValue(u.exchangeBuyResponseAssetId)],
    ['Buy completed', detailValue(u.exchangeBuyCompleted)],
    ['Sell asset', detailValue(u.exchangeSellAssetDescription)],
    ['Sell asset ID/type', pairDetail(u.exchangeSellAssetId, u.exchangeSellAssetType)],
    ['Sell asset position', detailValue(u.exchangeSellAssetPosition)],
    ['Sell price', detailValue(u.exchangeSellAssetPrice)],
    ['Sell candidates', detailValue(u.exchangeSellAssetCandidates)],
    ['Sell response asset ID/type', pairDetail(u.exchangeSellResponseAssetId, u.exchangeSellResponseAssetType)],
    ['Sell response team ID', detailValue(u.exchangeSellResponseTeamId)],
    ['Sell transaction decision', detailValue(u.exchangeSellTransactionDecision)],
    ['Sell attempted', detailValue(u.exchangeSellAttempted)],
    ['Sell recovered', detailValue(u.exchangeSellRecovered)],
    ['Sell completed', detailValue(u.exchangeSellCompleted)],
    ['Sell verification', detailValue(u.exchangeSellVerification)],
    ['Details members', detailValue(u.exchangeDetailsLeagueMembers)],
    ['Details teams', detailValue(u.exchangeDetailsTeamCount)],
    ['Details leader', detailValue(u.exchangeDetailsTopTeam)],
    ['Details own rank', detailValue(u.exchangeDetailsOwnRank)],
    ['Transactions week', detailValue(u.exchangeTransactionsWeek)],
    ['Transactions assets', detailValue(u.exchangeTransactionsAssetCount)],
    ['Transactions total', detailValue(u.exchangeTransactionsTotal)],
    ['Buy2 asset', detailValue(u.exchangeBuy2AssetDescription)],
    ['Buy2 completed', detailValue(u.exchangeBuy2Completed)],
    ['Trade summary', detailValue(u.exchangeTradeSummary)],
  ]);
}

function buildDomainDataPanel(u, domain) {
  if (domain === 'blitz') return buildBlitzDataPanel(u);
  if (domain === 'exchange') return buildExchangeDataPanel(u);
  return '';
}

function barColor(pct) {
  return pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
}

function srColor(val) { return val >= 80 ? '#16a34a' : val >= 50 ? '#d97706' : '#dc2626'; }
function srRing(val)  { return val >= 80 ? '#22c55e' : val >= 50 ? '#f59e0b' : '#ef4444'; }

function sharedCss(sr) {
  const rc = srColor(sr);
  const rr = srRing(sr);
  return `<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#111827}
  .wrap{max-width:1440px;margin:0 auto;padding:24px 20px}
  .header-card{background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:24px 28px;margin-bottom:20px}
  .header-title{font-size:22px;font-weight:800;color:#1d4ed8;margin:0 0 4px 0}
  .header-sub{font-size:13px;color:#6b7280;margin:0 0 16px 0}
  .config-pills{display:flex;gap:10px;flex-wrap:wrap}
  .pill{background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:600;color:#1d4ed8}
  .stats-row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px}
  .stat-box{flex:1;min-width:140px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px}
  .stat-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:6px}
  .stat-value{font-size:28px;font-weight:800;line-height:1}
  .stat-sub{font-size:11px;color:#9ca3af;margin-top:4px}
  .sr-box{min-width:160px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .sr-ring{width:80px;height:80px;border-radius:50%;background:conic-gradient(${rr} 0% ${sr}%,#e5e7eb ${sr}% 100%);display:flex;align-items:center;justify-content:center}
  .sr-inner{width:58px;height:58px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:${rc}}
  .section-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px 24px;margin-bottom:20px}
  .section-title{font-size:15px;font-weight:700;color:#1d4ed8;margin:0 0 14px 0;display:flex;align-items:center;gap:8px}
  .flow-grid{display:flex;gap:12px;flex-wrap:wrap}
  .flow-card{flex:1;min-width:180px;max-width:230px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px}
  .flow-card-label{font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
  .flow-card-name{font-size:13px;font-weight:700;color:#111827;margin-bottom:10px}
  .flow-badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
  .flow-bar-bg{background:#e5e7eb;border-radius:6px;height:8px;overflow:hidden}
  .tab-nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}
  .tab-btn{padding:9px 18px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:6px}
  .tab-btn:hover{background:#f0f9ff;color:#1d4ed8;border-color:#93c5fd}
  .tab-btn.active{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
  .tab-badge{background:#f1f5f9;color:#374151;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700}
  .tab-btn.active .tab-badge{background:rgba(255,255,255,.25);color:#fff}
  .tab-panel{display:none}
  .tab-panel.active{display:block}
  .flow-data-disclosure{border-bottom:1px solid #e2e8f0;background:#f8fafc}
  .flow-data-disclosure summary{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;list-style:none;color:#1d4ed8;font-size:12px;font-weight:700}
  .flow-data-disclosure summary::-webkit-details-marker{display:none}
  .flow-data-disclosure summary::after{content:'▾';margin-left:auto;color:#64748b;font-size:16px;line-height:1;transition:transform .15s}
  .flow-data-disclosure[open] summary{background:#eff6ff}
  .flow-data-disclosure[open] summary::after{transform:rotate(180deg)}
  .flow-data-disclosure-context{color:#64748b;font-weight:500}
  .flow-data-disclosure-content{padding:0 14px 12px}
  .flow-data-disclosure-content .flow-data-panel{margin:0}
  .table-wrap{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
  table{width:100%;border-collapse:collapse}
  thead tr{background:#f8fafc}
  th{padding:10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:2px solid #e2e8f0}
  td{padding:8px 10px;font-size:13px;border-bottom:1px solid #f1f5f9}
  tr:last-child td{border-bottom:none}
  tbody tr:hover td{background:#fafafa}
  .msg-cell{white-space:pre-wrap;word-break:break-word;max-width:640px;font-family:Consolas,monospace;font-size:11px;line-height:1.45;color:#4b5563}
</style>`;
}

function buildUserReportHtml(users, errorsData) {
  const domain = suiteReportGroup({ name: SUITE });
  const allPass = users.filter((u) => u.result === 'ALL_PASS').length;
  const partial  = users.length - allPass;
  const sr       = users.length ? Math.round((allPass / users.length) * 100) : 0;
  const rc       = srColor(sr);

  const flowStats = buildFlowStats(users);
  const flowCards = flowStats.map((st) => {
    const total = st.pass + st.fail + st.skip;
    const pct   = total ? Math.round((st.pass / total) * 100) : 0;
    const bc    = barColor(pct);
    return `
    <div class="flow-card">
      <div class="flow-card-label">Flow</div>
      <div class="flow-card-name">${esc(st.num)}. ${esc(st.name)}</div>
      <div class="flow-badges">
        <span style="background:#dcfce7;color:#166534;padding:2px 7px;border-radius:8px;font-size:11px;font-weight:700;">${st.pass} pass</span>
        <span style="background:#fee2e2;color:#991b1b;padding:2px 7px;border-radius:8px;font-size:11px;font-weight:700;">${st.fail} fail</span>
        <span style="background:#f3f4f6;color:#6b7280;padding:2px 7px;border-radius:8px;font-size:11px;font-weight:700;">${st.skip} skip</span>
      </div>
      <div class="flow-bar-bg"><div style="width:${pct}%;background:${bc};height:8px;border-radius:6px;"></div></div>
      <div style="font-size:12px;color:${bc};font-weight:700;margin-top:4px;">${pct}% success</div>
    </div>`;
  }).join('');

  const summaryDomainCells = (u) => {
    if (domain === 'blitz') {
      return `<td style="font-family:Consolas,monospace;font-size:11px;">${esc(u.blitzLeagueId || '-')}</td>` +
        `<td style="font-family:Consolas,monospace;font-size:11px;">${esc(u.blitzTeamId || '-')}</td>` +
        `<td>${esc(u.blitzLineupWeek || '-')}</td>`;
    }
    if (domain === 'exchange') {
      const leagueId = u.exchangeLeagueId || u.exchangeJoinedLeagueId;
      const teamId = u.exchangeTeamId || u.exchangeJoinedTeamId;
      return `<td style="font-family:Consolas,monospace;font-size:11px;">${esc(leagueId || '-')}</td>` +
        `<td style="font-family:Consolas,monospace;font-size:11px;">${esc(teamId || '-')}</td>`;
    }
    return '';
  };
  const summaryColspan = 9 + (domain === 'blitz' ? 3 : domain === 'exchange' ? 2 : 0);
  const summaryHeaders = domain === 'blitz'
    ? '<th>Blitz League ID</th><th>Blitz Team ID</th><th>Lineup Week</th>'
    : domain === 'exchange'
      ? '<th>Exchange League ID</th><th>Exchange Team ID</th>'
      : '';

  const summaryRows = users.map((u) => {
    const rowBg = u.result !== 'ALL_PASS' ? 'background:#fffbeb;' : '';
    return `<tr style="${rowBg}">
      <td style="font-weight:600;color:#374151;">VU ${esc(u.vu)}</td>
      <td style="color:#6b7280;">iter ${esc(u.iter)}</td>
      <td style="font-family:Consolas,monospace;font-size:11px;">${esc(u.email)}</td>
      <td style="font-size:12px;color:#6b7280;">${esc(u.username)}</td>
      <td>${esc(u.userId || '-')}</td>
      ${summaryDomainCells(u)}
      <td style="color:#166534;font-weight:700;">${u.passed}</td>
      <td style="color:#991b1b;font-weight:700;">${u.failed}</td>
      <td style="color:#6b7280;">${u.skipped}</td>
      <td>${resultBadge(u.result)}</td>
    </tr>`;
    }).join('') || `<tr><td colspan="${summaryColspan}" style="padding:14px;color:#6b7280;text-align:center;">No users captured</td></tr>`;

  const perUserBlocks = users.map((u) => {
    const isPass    = u.result === 'ALL_PASS';
    const hdrBg     = isPass ? '#f0fdf4' : '#fffbeb';
    const hdrBorder = isPass ? '#86efac' : '#fcd34d';
    const domainHeader = domain === 'blitz'
      ? `${u.blitzLeagueId ? `<span style="color:#6b7280;">· blitz league ${esc(u.blitzLeagueId)}</span>` : ''}` +
        `${u.blitzTeamId ? `<span style="color:#6b7280;">· blitz team ${esc(u.blitzTeamId)}</span>` : ''}` +
        `${u.blitzLineupWeek ? `<span style="color:#6b7280;">· week ${esc(u.blitzLineupWeek)}</span>` : ''}`
      : domain === 'exchange'
        ? `${(u.exchangeLeagueId || u.exchangeJoinedLeagueId) ? `<span style="color:#6b7280;">· exchange league ${esc(u.exchangeLeagueId || u.exchangeJoinedLeagueId)}</span>` : ''}` +
          `${(u.exchangeTeamId || u.exchangeJoinedTeamId) ? `<span style="color:#6b7280;">· exchange team ${esc(u.exchangeTeamId || u.exchangeJoinedTeamId)}</span>` : ''}`
        : '';
    const domainData = buildDomainDataPanel(u, domain);
    const flowDataDisclosure = domainData
      ? `<details class="flow-data-disclosure">
          <summary>
            <span>View flow data</span>
            <span class="flow-data-disclosure-context">VU ${esc(u.vu)} · iter ${esc(u.iter)}</span>
          </summary>
          <div class="flow-data-disclosure-content">${domainData}</div>
        </details>`
      : '';
    const stepRows  = (u.steps || []).map((s) => {
      const cause  = (s.status === 'FAIL' || s.status === 'SKIP') ? explainErrorCause(s.code, s.message) : '-';
      const rowBg  = s.status === 'FAIL'
        ? 'background:#fff7ed;'
        : s.status === 'SKIP'
          ? (s.businessCondition ? 'background:#fffbeb;' : 'background:#f9fafb;')
          : '';
      const flags = [
        s.failureType || s.categoryLabel,
        s.recovered ? 'recovered' : '',
        s.businessRule && s.failureType !== 'Business rule' ? 'business rule' : '',
        s.businessCondition && s.failureType !== 'Business condition' ? 'business condition' : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `<tr style="${rowBg}">
        <td style="font-weight:500;color:#374151;">${esc(s.num)}. ${esc(s.label || stepName(s.key))}</td>
        <td>${statusBadge(s.status)}</td>
        <td style="font-family:Consolas,monospace;font-size:11px;font-weight:700;">${s.dur != null ? `${s.dur}ms` : '-'}</td>
        <td style="color:#6b7280;font-size:12px;">${esc(flags)}</td>
        <td style="font-family:Consolas,monospace;font-size:11px;">${esc(s.code || '-')}</td>
        <td style="font-weight:600;">${esc(s.httpStatus || '-')}</td>
        <td class="msg-cell">${esc(s.message || '-')}</td>
        <td style="font-size:12px;color:#6b7280;">${esc(cause)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" style="padding:10px;color:#6b7280;">No step details</td></tr>';

    return `
    <div style="margin:0 0 12px 0;border:1px solid ${hdrBorder};border-radius:10px;overflow:hidden;">
      <div style="padding:10px 14px;background:${hdrBg};border-bottom:1px solid ${hdrBorder};display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-weight:700;color:#111827;">VU ${esc(u.vu)}</span>
        <span style="color:#6b7280;">·</span>
        <span style="color:#6b7280;">iter ${esc(u.iter)}</span>
        <span style="color:#6b7280;">·</span>
        <span style="font-family:Consolas,monospace;font-size:11px;color:#374151;">${esc(u.email)}</span>
        ${domainHeader}
        <span style="margin-left:auto;">${resultBadge(u.result)}</span>
      </div>
      ${flowDataDisclosure}
      <table>
        <thead><tr>
          <th>Step</th><th>Status</th><th>Time</th><th>Failure Type</th><th>Error Code</th>
          <th>HTTP</th><th>Reason</th><th>Likely Cause</th>
        </tr></thead>
        <tbody>${stepRows}</tbody>
      </table>
    </div>`;
  }).join('') || '<p style="color:#6b7280;padding:10px;">No step details</p>';

  const errRowHtml = (rows) => rows.length
    ? rows.map((r) => `<tr>
        <td style="font-weight:600;color:#374151;">${esc(r.endpoint)}</td>
        <td><span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:8px;font-size:12px;font-weight:700;">${esc(r.http_status)}</span></td>
        <td style="font-family:Consolas,monospace;font-size:11px;">${esc(r.error_code)}</td>
        <td style="font-weight:700;">${esc(r.count)}</td>
        <td style="color:#6b7280;font-size:12px;">VU ${esc(r.vu)} / iter ${esc(r.iter)}</td>
        <td class="msg-cell">${esc(r.message)}</td>
        <td style="font-size:12px;color:#6b7280;">${esc(r.cause)}</td>
      </tr>`).join('')
    : '<tr><td colspan="7" style="padding:14px;color:#6b7280;text-align:center;">No errors recorded</td></tr>';

  const errTableHeaders = `<thead><tr>
    <th>Endpoint</th><th>HTTP</th><th>Error Code</th><th>Count</th>
    <th>VU / Iter</th><th>Message</th><th>Likely Cause</th>
  </tr></thead>`;

  const { backend, business } = errorsData;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>EFF k6 — ${esc(SUITE)}</title>
${sharedCss(sr)}
</head>
<body>
<div class="wrap">

  <!-- HEADER -->
  <div class="header-card">
    <div class="header-title">EFF k6 Framework — ${esc(SUITE)}</div>
    <div class="header-sub">Generated by EFF k6 Performance Framework</div>
    <div class="config-pills">
      <span class="pill">VUs: ${esc(VUS)}</span>
      <span class="pill">Iterations: ${esc(TOTAL_ITERATIONS)}</span>
      <span class="pill">Total Users: ${users.length}</span>
    </div>
  </div>

  <!-- STAT BOXES -->
  <div class="stats-row">
    <div class="stat-box">
      <div class="stat-label">Total Users</div>
      <div class="stat-value" style="color:#1d4ed8">${users.length}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">All Passed</div>
      <div class="stat-value" style="color:#16a34a">${allPass}</div>
      <div class="stat-sub">users fully passing</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">With Failures</div>
      <div class="stat-value" style="color:#dc2626">${partial}</div>
      <div class="stat-sub">partial or full fail</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Backend Errors</div>
      <div class="stat-value" style="color:#dc2626">${backend.rows.length}</div>
      <div class="stat-sub">HTTP, GraphQL, and server failures</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Business Errors</div>
      <div class="stat-value" style="color:#7c3aed">${business.rows.length}</div>
      <div class="stat-sub">business-rule conditions</div>
    </div>
    <div class="sr-box">
      <div class="stat-label" style="margin-bottom:10px;">Success Rate</div>
      <div class="sr-ring"><div class="sr-inner">${sr}%</div></div>
      <div style="font-size:11px;color:${rc};font-weight:700;margin-top:8px;">${allPass} / ${users.length} users</div>
    </div>
  </div>

  <!-- FLOWS -->
  <div class="section-card">
    <div class="section-title">
      <svg width="16" height="16" fill="none" stroke="#1d4ed8" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      Flows Executed in This Run
    </div>
    <div class="flow-grid">${flowCards || '<p style="color:#6b7280;font-size:13px;">No flow data available</p>'}</div>
  </div>

  <!-- TAB NAV -->
  <div class="tab-nav">
    <button class="tab-btn active" onclick="switchTab(this,'summary')">
      All Users — Quick Summary <span class="tab-badge">${users.length}</span>
    </button>
    <button class="tab-btn" onclick="switchTab(this,'peruser')">
      Per User — Step & Flow Details <span class="tab-badge">${users.length}</span>
    </button>
    <button class="tab-btn" onclick="switchTab(this,'errbackend')">
      Backend Errors <span class="tab-badge">${backend.rows.length}</span>
    </button>
    <button class="tab-btn" onclick="switchTab(this,'errbusiness')">
      Business Errors <span class="tab-badge">${business.rows.length}</span>
    </button>
  </div>

  <!-- TAB: ALL USERS SUMMARY -->
  <div id="tab-summary" class="tab-panel active">
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>VU</th><th>Iteration</th><th>Email</th><th>Username</th>
          <th>User ID</th>${summaryHeaders}<th>Pass</th><th>Fail</th><th>Skip</th><th>Result</th>
        </tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </div>
  </div>

  <!-- TAB: PER USER STEP DETAILS -->
  <div id="tab-peruser" class="tab-panel">
    ${perUserBlocks}
  </div>

  <!-- TAB: BACKEND ERRORS -->
  <div id="tab-errbackend" class="tab-panel">
    <div class="table-wrap">
      <table>${errTableHeaders}<tbody>${errRowHtml(backend.rows)}</tbody></table>
    </div>
  </div>

  <!-- TAB: BUSINESS ERRORS -->
  <div id="tab-errbusiness" class="tab-panel">
    <div class="table-wrap">
      <table>${errTableHeaders}<tbody>${errRowHtml(business.rows)}</tbody></table>
    </div>
  </div>

</div>
<script>
function switchTab(btn, name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
}
</script>
</body>
</html>`;
}

export function handleSummary(data, suite) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = `${REPORT_DIR}/${suiteReportGroup(suite)}`;
  const leaf = suiteReportLeaf(suite);
  const htmlPath = `${dir}/${leaf}-${stamp}.html`;
  const latestPath = `${dir}/${leaf}-latest.html`;

  const users = parseUserFlows(data);

  const errorsData = {
    backend: parseErrorChecks(data, ['[5xx] ', '[BACKEND] ', '[API] ']),
    business: parseErrorChecks(data, '[BUSINESS] '),
  };

  const mergedHtml = buildUserReportHtml(users, errorsData);

  const files = {
    [htmlPath]: mergedHtml,
    [latestPath]: mergedHtml,
    stdout: textSummary(data),
  };

  if (suite && suite.writePool && users.length > 0) {
    const updated = suite.removeFromPool
      ? removeFromPool(INIT_POOL.users, users, INIT_POOL.password || PASSWORD)
      : mergePool(INIT_POOL.users, users, INIT_POOL.password || PASSWORD);
    files[RESOLVED_POOL_PATH] = JSON.stringify(updated, null, 2);
    const verb = suite.removeFromPool ? 'cleaned' : 'written';
    console.log(`User pool ${verb}: ${RESOLVED_POOL_PATH} (${updated.users.length} users remaining)`);
  }

  console.log(`\nHTML report: ${htmlPath}`);
  console.log(`HTML report (latest): ${latestPath}\n`);

  return files;
}