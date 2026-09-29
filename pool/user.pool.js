import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { JOIN_HOST_EMAIL, JOIN_INVITE_CODE, PASSWORD } from '../config/env.config.js';
import { login, loginOk } from '../graphql/auth.graphql.js';
import {
  findBlitzLeagueByOwnerAndInvite,
  getBlitzLeagues,
  getBlitzLeaguesOk,
  getPublicBlitzLeagues,
  getPublicBlitzLeaguesOk,
  pickPublicBlitzLeague,
} from '../graphql/blitz.graphql.js';
import {
  findExchangeLeagueByInvite,
  findExchangeLeagueByOwnerAndInvite,
  getExchangeLeagues,
  getExchangeLeaguesOk,
  getPublicExchangeLeagues,
  getPublicExchangeLeaguesOk,
  pickPublicExchangeLeague,
} from '../graphql/exchange.graphql.js';

let rawPoolFile = '';
try {
  rawPoolFile = open('../data/users.json');
} catch (e) {
  console.warn('[pool] data/users.json not found, starting with an empty pool');
}

function parsePoolFile(raw) {
  if (!raw) return { password: PASSWORD, users: [] };
  const parsed = JSON.parse(raw);
  return {
    password: parsed.password || PASSWORD,
    users: Array.isArray(parsed.users) ? parsed.users : [],
  };
}

function emptyBlitz() {
  return {
    leagueId: null,
    leagueName: null,
    inviteCode: null,
    teamId: null,
    teamName: null,
    joinedLeagueId: null,
    joinedTeamId: null,
    joinedTeamName: null,
    lineupWeek: null,
  };
}

function normalizeExchange(value) {
  const exchange = value || {};
  return {
    leagueId: exchange.leagueId == null ? null : exchange.leagueId,
    leagueName: exchange.leagueName == null ? null : exchange.leagueName,
    inviteCode: exchange.inviteCode == null ? null : exchange.inviteCode,
    teamId: exchange.teamId == null ? null : exchange.teamId,
    teamName: exchange.teamName == null ? null : exchange.teamName,
    joinedLeagueId: exchange.joinedLeagueId == null ? null : exchange.joinedLeagueId,
    joinedTeamId: exchange.joinedTeamId == null ? null : exchange.joinedTeamId,
    joinedTeamName: exchange.joinedTeamName == null ? null : exchange.joinedTeamName,
  };
}

const poolFile = parsePoolFile(rawPoolFile);
console.log(`[pool] loaded ${poolFile.users.length} users from data/users.json`);

const poolSnapshot = new SharedArray('user-pool', function () {
  return poolFile.users.map((u) => ({
    email: u.email,
    username: u.username || '',
    userId: u.userId || u.user_id || '',
    blitz: u.blitz || emptyBlitz(),
    exchange: normalizeExchange(u.exchange),
  }));
});

export const RESOLVED_POOL_PATH = 'data/users.json';

export const INIT_POOL = {
  password: poolFile.password,
  users: poolFile.users,
};

export function loadPool() {
  return {
    password: poolFile.password || PASSWORD,
    users: poolSnapshot,
    path: RESOLVED_POOL_PATH,
  };
}

export function getPoolUser(index) {
  return poolSnapshot[index] || null;
}

function emailKey(value) {
  return String(value || '').toLowerCase();
}

function inviteCodeKey(value) {
  return String(value || '').trim().toUpperCase();
}

function findLeagueByInviteCode(domain, token, wantInvite, ctx) {
  if (domain === 'exchange') {
    const listResp = getExchangeLeagues(token, ctx);
    if (!getExchangeLeaguesOk(listResp)) return null;
    const row = findExchangeLeagueByInvite(listResp, wantInvite);
    if (!row) return null;
    return { leagueId: String(row._id), leagueName: row.League_Name ? String(row.League_Name) : '' };
  }

  const listResp = getBlitzLeagues(token, ctx);
  if (!getBlitzLeaguesOk(listResp)) return null;
  const rows = (listResp.body.getBlitzLeagues && listResp.body.getBlitzLeagues.leagues) || [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row._id) continue;
    if (inviteCodeKey(row.Invite_Code) !== wantInvite) continue;
    return { leagueId: String(row._id), leagueName: row.League_Name ? String(row.League_Name) : '' };
  }
  return null;
}

export function resolvePrivateLeagueJoin(users, password, domain) {
  const inviteCode = inviteCodeKey(JOIN_INVITE_CODE);
  const hostEmail = String(JOIN_HOST_EMAIL || '').trim();
  if (!hostEmail || !inviteCode) {
    exec.test.abort(
      `SUITE requires both JOIN_HOST_EMAIL and JOIN_INVITE_CODE for the private ${domain} league to join. ` +
      `Example: k6 run main.js -e SUITE=${domain}-join-private-league -e JOIN_HOST_EMAIL="<host-email>" -e JOIN_INVITE_CODE="<invite-code>"`
    );
  }
  if (!users || !users.length) {
    exec.test.abort(
      `SUITE needs pool users to join the private ${domain} league. ` +
      'Run first: k6 run main.js -e SUITE=signup'
    );
  }

  const hostLogin = login(hostEmail, password, 'setup');
  if (!loginOk(hostLogin)) {
    exec.test.abort(
      `setup() login failed for JOIN_HOST_EMAIL=${hostEmail}; cannot resolve the private ${domain} league. ` +
      'The host must use the same PASSWORD as the pool.'
    );
  }
  const found = findLeagueByInviteCode(
    domain,
    hostLogin.body.login.accessToken,
    inviteCode,
    'setup'
  );

  if (!found || !found.leagueId) {
    exec.test.abort(
      `No private ${domain} league matched JOIN_HOST_EMAIL=${hostEmail} with JOIN_INVITE_CODE=${JOIN_INVITE_CODE}. ` +
      `The code must belong to a league the host belongs to.`
    );
  }
  const leagueId = found.leagueId;
  const leagueName = found.leagueName;

  const joiners = users.filter((u) => !teamInLeague(u, leagueId, domain));
  if (joiners.length === 0) {
    exec.test.abort(
      `Every pool user already has a team in ${domain} league ${leagueId}. ` +
      'Lower ITERATIONS, or sign up more users.'
    );
  }

  console.log(
    `${domain} private join host=${hostEmail} inviteCode=${JOIN_INVITE_CODE} leagueId=${leagueId}` +
    (leagueName ? ` name=${leagueName}` : '') +
    ` joiners=${joiners.length}`
  );

  return { inviteCode: JOIN_INVITE_CODE, leagueId, leagueName, users: joiners };
}

function teamInLeague(user, leagueId, domain = 'blitz') {
  const want = String(leagueId || '');
  const state = user && user[domain];
  if (!state || !want) return false;
  if (String(state.leagueId || '') === want && state.teamId) return true;
  if (String(state.joinedLeagueId || '') === want && state.joinedTeamId) return true;
  return false;
}

function discoverPublicExtremeLeague(users, password, emptyPoolMsg) {
  if (!users || !users.length) {
    exec.test.abort(emptyPoolMsg);
  }
  const loginResp = login(users[0].email, password, 'setup');
  if (!loginOk(loginResp)) {
    exec.test.abort(`setup() login failed for ${users[0].email}; cannot read getPublicBlitzLeagues.`);
  }
  const listResp = getPublicBlitzLeagues(loginResp.body.login.accessToken, 'setup');
  if (!getPublicBlitzLeaguesOk(listResp)) {
    exec.test.abort('setup() getPublicBlitzLeagues failed. Cannot pick a public Extreme League_ID.');
  }
  const picked = pickPublicBlitzLeague(listResp.body.getPublicBlitzLeagues.leagues);
  if (!picked || !picked._id) {
    exec.test.abort('setup() found no public Extreme Blitz league (Game_Type EXTREME, Game_Week 0).');
  }
  return {
    leagueId: String(picked._id),
    leagueName: picked.League_Name ? String(picked.League_Name) : '',
  };
}

export function resolvePublicBlitzJoin(users, password) {
  const picked = discoverPublicExtremeLeague(
    users,
    password,
    'SUITE needs pool users to discover a public Blitz league. Run first: k6 run main.js -e SUITE=signup'
  );
  const joiners = users.filter((u) => !teamInLeague(u, picked.leagueId));
  console.log(
    `Public join leagueId=${picked.leagueId}` +
    (picked.leagueName ? ` name=${picked.leagueName}` : '') +
    ` joiners=${joiners.length}`
  );
  return { leagueId: picked.leagueId, users: joiners };
}

export function resolvePublicBlitzLineup(users, password) {
  const picked = discoverPublicExtremeLeague(
    users,
    password,
    'SUITE needs pool users who already joined the public Blitz league. Run first: k6 run main.js -e SUITE=blitz-join-public-league'
  );
  const members = users.filter((u) => teamInLeague(u, picked.leagueId));
  if (members.length === 0) {
    exec.test.abort(
      `No pool user has a team in public league ${picked.leagueId}. ` +
      'Run first: k6 run main.js -e SUITE=blitz-join-public-league'
    );
  }
  console.log(
    `Public lineup leagueId=${picked.leagueId}` +
    (picked.leagueName ? ` name=${picked.leagueName}` : '') +
    ` members=${members.length}`
  );
  return { leagueId: picked.leagueId, users: members };
}

function discoverPublicExtremeExchangeLeague(users, password, emptyPoolMsg) {
  if (!users || !users.length) {
    exec.test.abort(emptyPoolMsg);
  }
  const loginResp = login(users[0].email, password, 'setup');
  if (!loginOk(loginResp)) {
    exec.test.abort(`setup() login failed for ${users[0].email}; cannot read getPublicExchangeLeagues.`);
  }
  const listResp = getPublicExchangeLeagues(loginResp.body.login.accessToken, 'setup');
  if (!getPublicExchangeLeaguesOk(listResp)) {
    exec.test.abort('setup() getPublicExchangeLeagues failed. Cannot pick a public Extreme Exchange League_ID.');
  }
  const picked = pickPublicExchangeLeague(listResp.body.getPublicExchangeLeagues.leagues);
  if (!picked || !picked._id) {
    exec.test.abort('setup() found no public Extreme Exchange league (Game_Type EXTREME, Game_Week 0).');
  }
  return {
    leagueId: String(picked._id),
    leagueName: picked.League_Name ? String(picked.League_Name) : '',
  };
}

export function resolvePublicExchangeJoin(users, password) {
  const picked = discoverPublicExtremeExchangeLeague(
    users,
    password,
    'SUITE needs pool users to discover a public Exchange league. Run first: k6 run main.js -e SUITE=signup'
  );
  const joiners = users.filter((u) => !teamInLeague(u, picked.leagueId, 'exchange'));
  console.log(
    `Public Exchange join leagueId=${picked.leagueId}` +
    (picked.leagueName ? ` name=${picked.leagueName}` : '') +
    ` joiners=${joiners.length}`
  );
  return { leagueId: picked.leagueId, users: joiners };
}

export function resolvePublicExchangeLineup(users, password) {
  const picked = discoverPublicExtremeExchangeLeague(
    users,
    password,
    'SUITE needs pool users who already joined the public Exchange league. Run first: k6 run main.js -e SUITE=exchange-join-public-league'
  );
  const members = users.filter((u) => teamInLeague(u, picked.leagueId, 'exchange'));
  if (members.length === 0) {
    exec.test.abort(
      `No pool user has a team in public Exchange league ${picked.leagueId}. ` +
      'Run first: k6 run main.js -e SUITE=exchange-join-public-league'
    );
  }
  console.log(
    `Public Exchange lineup leagueId=${picked.leagueId}` +
    (picked.leagueName ? ` name=${picked.leagueName}` : '') +
    ` members=${members.length}`
  );
  return { leagueId: picked.leagueId, users: members };
}

function leagueIdFromInviteCode(users, password, inviteCode) {
  const want = String(inviteCode || '').trim().toUpperCase();
  const owner = users.find(
    (u) => u.blitz && String(u.blitz.inviteCode || '').toUpperCase() === want && u.blitz.leagueId
  );
  if (owner) return String(owner.blitz.leagueId);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (!user.blitz || !(user.blitz.teamId || user.blitz.joinedTeamId)) continue;
    const loginResp = login(user.email, password, 'setup');
    if (!loginOk(loginResp)) continue;
    const leagueId = findBlitzLeagueByOwnerAndInvite('', want, loginResp.body.login.accessToken, 'setup');
    if (leagueId) return leagueId;
  }

  exec.test.abort(
    `JOIN_INVITE_CODE=${inviteCode} did not match a Blitz league any pool user belongs to. ` +
    'Join that league first: k6 run main.js -e SUITE=blitz-join-private-league -e JOIN_INVITE_CODE=' +
    inviteCode
  );
}

function leagueIdFromHostAndInvite(users, password, email, inviteCode) {
  const wantInvite = String(inviteCode || '').trim().toUpperCase();
  const owner = users.find(
    (u) =>
      emailKey(u.email) === emailKey(email) &&
      u.blitz &&
      String(u.blitz.inviteCode || '').toUpperCase() === wantInvite &&
      u.blitz.leagueId
  );
  if (owner) return String(owner.blitz.leagueId);

  const hostLogin = login(email, password, 'setup');
  if (loginOk(hostLogin)) {
    const fromHost = findBlitzLeagueByOwnerAndInvite(
      email,
      inviteCode,
      hostLogin.body.login.accessToken,
      'setup'
    );
    if (fromHost) return fromHost;
  }

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (!user.blitz || !(user.blitz.joinedTeamId || user.blitz.teamId)) continue;
    const loginResp = login(user.email, password, 'setup');
    if (!loginOk(loginResp)) continue;
    const leagueId = findBlitzLeagueByOwnerAndInvite(
      email,
      inviteCode,
      loginResp.body.login.accessToken,
      'setup'
    );
    if (leagueId) return leagueId;
  }

  exec.test.abort(
    `No Blitz league for JOIN_HOST_EMAIL=${email} with JOIN_INVITE_CODE=${inviteCode} ` +
    'that any pool user belongs to. Join that league first with the same invite code.'
  );
}

function lineupMembers(users, leagueId) {
  const members = users.filter((u) => teamInLeague(u, leagueId));
  if (members.length === 0) {
    exec.test.abort(
      `No pool user has a team in league ${leagueId}. ` +
      'Join first: k6 run main.js -e SUITE=blitz-join-private-league -e JOIN_INVITE_CODE=' +
      (JOIN_INVITE_CODE || '<invite-code>')
    );
  }
  return members;
}

export function resolveLineupLeague(users, password) {
  if (JOIN_HOST_EMAIL && !JOIN_INVITE_CODE) {
    exec.test.abort(
      'JOIN_HOST_EMAIL for lineup also needs JOIN_INVITE_CODE so the correct league is used when that account owns more than one. ' +
      'Owner-only lineups: omit both. Watchable host league: pass both -e JOIN_HOST_EMAIL=... -e JOIN_INVITE_CODE=...'
    );
  }

  if (JOIN_HOST_EMAIL && JOIN_INVITE_CODE) {
    const leagueId = leagueIdFromHostAndInvite(users, password, JOIN_HOST_EMAIL, JOIN_INVITE_CODE);
    const members = lineupMembers(users, leagueId);
    console.log(
      `Lineup host=${JOIN_HOST_EMAIL} inviteCode=${JOIN_INVITE_CODE} leagueId=${leagueId} members=${members.length}`
    );
    return { leagueId, users: members, inviteCode: JOIN_INVITE_CODE };
  }

  if (JOIN_INVITE_CODE) {
    const leagueId = leagueIdFromInviteCode(users, password, JOIN_INVITE_CODE);
    const members = lineupMembers(users, leagueId);
    console.log(`Lineup inviteCode=${JOIN_INVITE_CODE} leagueId=${leagueId} members=${members.length}`);
    return { leagueId, users: members, inviteCode: JOIN_INVITE_CODE };
  }

  const owners = users.filter((u) => u.blitz && u.blitz.teamId);
  if (owners.length === 0) {
    exec.test.abort(
      'Owner lineup needs pool users with blitz.teamId. ' +
      'Run first: k6 run main.js -e SUITE=blitz-create-team'
    );
  }

  console.log(`Lineup mode=owner ownedTeams=${owners.length}`);
  return { leagueId: '', users: owners };
}

function exchangeLeagueIdFromInviteCode(users, password, inviteCode) {
  const want = String(inviteCode || '').trim().toUpperCase();
  const owner = users.find(
    (u) => u.exchange && String(u.exchange.inviteCode || '').toUpperCase() === want && u.exchange.leagueId
  );
  if (owner) return String(owner.exchange.leagueId);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (!user.exchange || !(user.exchange.teamId || user.exchange.joinedTeamId)) continue;
    const loginResp = login(user.email, password, 'setup');
    if (!loginOk(loginResp)) continue;
    const leagueId = findExchangeLeagueByOwnerAndInvite('', want, loginResp.body.login.accessToken, 'setup');
    if (leagueId) return leagueId;
  }

  exec.test.abort(
    `JOIN_INVITE_CODE=${inviteCode} did not match an Exchange league any pool user belongs to. ` +
    'Join that league first: k6 run main.js -e SUITE=exchange-join-private-league -e JOIN_HOST_EMAIL=<host-email> -e JOIN_INVITE_CODE=' +
    inviteCode
  );
}

function exchangeLeagueIdFromHostAndInvite(users, password, email, inviteCode) {
  const wantInvite = String(inviteCode || '').trim().toUpperCase();
  const owner = users.find(
    (u) =>
      emailKey(u.email) === emailKey(email) &&
      u.exchange &&
      String(u.exchange.inviteCode || '').toUpperCase() === wantInvite &&
      u.exchange.leagueId
  );
  if (owner) return String(owner.exchange.leagueId);

  const hostLogin = login(email, password, 'setup');
  if (loginOk(hostLogin)) {
    const fromHost = findExchangeLeagueByOwnerAndInvite(
      email,
      inviteCode,
      hostLogin.body.login.accessToken,
      'setup'
    );
    if (fromHost) return fromHost;
  }

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (!user.exchange || !(user.exchange.joinedTeamId || user.exchange.teamId)) continue;
    const loginResp = login(user.email, password, 'setup');
    if (!loginOk(loginResp)) continue;
    const leagueId = findExchangeLeagueByOwnerAndInvite(
      email,
      inviteCode,
      loginResp.body.login.accessToken,
      'setup'
    );
    if (leagueId) return leagueId;
  }

  exec.test.abort(
    `No Exchange league for JOIN_HOST_EMAIL=${email} with JOIN_INVITE_CODE=${inviteCode} ` +
    'that any pool user belongs to. Join that league first with the same host email and invite code.'
  );
}

function exchangeLineupMembers(users, leagueId) {
  const members = users.filter((u) => teamInLeague(u, leagueId, 'exchange'));
  if (members.length === 0) {
    exec.test.abort(
      `No pool user has a team in Exchange league ${leagueId}. ` +
      'Join first: k6 run main.js -e SUITE=exchange-join-private-league -e JOIN_HOST_EMAIL=' +
      (JOIN_HOST_EMAIL || '<host-email>') + ' -e JOIN_INVITE_CODE=' +
      (JOIN_INVITE_CODE || '<invite-code>')
    );
  }
  return members;
}

export function resolveExchangeLineupLeague(users, password) {
  if (JOIN_HOST_EMAIL && !JOIN_INVITE_CODE) {
    exec.test.abort(
      'JOIN_HOST_EMAIL for Exchange also needs JOIN_INVITE_CODE so the correct league is used when that account owns more than one. ' +
      'Owner-only portfolio/trading: omit both. Host league: pass both -e JOIN_HOST_EMAIL=... -e JOIN_INVITE_CODE=...'
    );
  }

  if (JOIN_HOST_EMAIL && JOIN_INVITE_CODE) {
    const leagueId = exchangeLeagueIdFromHostAndInvite(users, password, JOIN_HOST_EMAIL, JOIN_INVITE_CODE);
    const members = exchangeLineupMembers(users, leagueId);
    console.log(
      `Exchange lineup host=${JOIN_HOST_EMAIL} inviteCode=${JOIN_INVITE_CODE} leagueId=${leagueId} members=${members.length}`
    );
    return { leagueId, users: members, inviteCode: JOIN_INVITE_CODE };
  }

  if (JOIN_INVITE_CODE) {
    const leagueId = exchangeLeagueIdFromInviteCode(users, password, JOIN_INVITE_CODE);
    const members = exchangeLineupMembers(users, leagueId);
    console.log(`Exchange lineup inviteCode=${JOIN_INVITE_CODE} leagueId=${leagueId} members=${members.length}`);
    return { leagueId, users: members, inviteCode: JOIN_INVITE_CODE };
  }

  const owners = users.filter((u) => u.exchange && u.exchange.teamId);
  if (owners.length === 0) {
    exec.test.abort(
      'Owner Exchange portfolio needs pool users with exchange.teamId. ' +
      'Run first: k6 run main.js -e SUITE=exchange-create-team'
    );
  }

  console.log(`Exchange lineup mode=owner ownedTeams=${owners.length}`);
  return { leagueId: '', users: owners };
}

function poolVal(value) {
  if (value == null || value === '' || value === 'unknown') return null;
  return value;
}

function mergeBlitz(prevBlitz, u) {
  const prev = prevBlitz || emptyBlitz();
  const joinedLeagueId = poolVal(u.blitzJoinedLeagueId);
  const reportedLeagueId = poolVal(u.blitzLeagueId);
  const lineupWeek = poolVal(u.blitzLineupWeek) || prev.lineupWeek || null;
  const joinThisRun = !!(
    joinedLeagueId &&
    (!reportedLeagueId || String(reportedLeagueId) === String(joinedLeagueId))
  );

  if (joinThisRun) {
    return {
      leagueId: prev.leagueId || null,
      leagueName: prev.leagueName || null,
      inviteCode: prev.inviteCode || null,
      teamId: prev.teamId || null,
      teamName: prev.teamName || null,
      joinedLeagueId: joinedLeagueId,
      joinedTeamId: poolVal(u.blitzJoinedTeamId) || poolVal(u.blitzTeamId) || prev.joinedTeamId || null,
      joinedTeamName: poolVal(u.blitzJoinedTeamName) || poolVal(u.blitzTeamName) || prev.joinedTeamName || null,
      lineupWeek: lineupWeek,
    };
  }

  return {
    leagueId: reportedLeagueId || prev.leagueId || null,
    leagueName: poolVal(u.blitzLeagueName) || prev.leagueName || null,
    inviteCode: prev.inviteCode || null,
    teamId: poolVal(u.blitzTeamId) || prev.teamId || null,
    teamName: poolVal(u.blitzTeamName) || prev.teamName || null,
    joinedLeagueId: prev.joinedLeagueId || null,
    joinedTeamId: prev.joinedTeamId || null,
    joinedTeamName: prev.joinedTeamName || null,
    lineupWeek: lineupWeek,
  };
}

function mergeExchange(prevExchange, u) {
  const prev = normalizeExchange(prevExchange);
  const joinedLeagueId = poolVal(u.exchangeJoinedLeagueId);
  const reportedLeagueId = poolVal(u.exchangeLeagueId);
  const joinThisRun = !!(
    joinedLeagueId &&
    (!reportedLeagueId || String(reportedLeagueId) === String(joinedLeagueId))
  );

  if (joinThisRun) {
    return {
      leagueId: prev.leagueId || null,
      leagueName: prev.leagueName || null,
      inviteCode: prev.inviteCode || null,
      teamId: prev.teamId || null,
      teamName: prev.teamName || null,
      joinedLeagueId: joinedLeagueId,
      joinedTeamId: poolVal(u.exchangeJoinedTeamId) || poolVal(u.exchangeTeamId) || prev.joinedTeamId || null,
      joinedTeamName: poolVal(u.exchangeJoinedTeamName) || poolVal(u.exchangeTeamName) || prev.joinedTeamName || null,
    };
  }

  return {
    leagueId: reportedLeagueId || prev.leagueId || null,
    leagueName: poolVal(u.exchangeLeagueName) || prev.leagueName || null,
    inviteCode: poolVal(u.exchangeInviteCode) || prev.inviteCode || null,
    teamId: poolVal(u.exchangeTeamId) || prev.teamId || null,
    teamName: poolVal(u.exchangeTeamName) || prev.teamName || null,
    joinedLeagueId: prev.joinedLeagueId || null,
    joinedTeamId: prev.joinedTeamId || null,
    joinedTeamName: prev.joinedTeamName || null,
  };
}

function passedStep(u, key) {
  const steps = u && u.steps ? u.steps : [];
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] && steps[i].key === key && steps[i].status === 'PASS') return true;
  }
  return false;
}

function poolEligible(u) {
  if (!u || !u.email) return false;
  if (u.result === 'ALL_PASS') return true;
  return (
    passedStep(u, 'signup.signUp') &&
    passedStep(u, 'signup.setPassword') &&
    passedStep(u, 'signup.verifyEmail')
  );
}

function stampHostInvite(byEmail, newUsers) {
  const ownersByLeague = {};
  Object.keys(byEmail).forEach((key) => {
    const owner = byEmail[key];
    const leagueId = owner.blitz && owner.blitz.leagueId ? String(owner.blitz.leagueId) : '';
    if (!leagueId) return;
    if (!ownersByLeague[leagueId]) ownersByLeague[leagueId] = [];
    ownersByLeague[leagueId].push(owner);
  });

  (newUsers || []).forEach((u) => {
    if (!u || u.result !== 'ALL_PASS' || !u.blitzJoinedLeagueId || !u.blitzInviteCode) return;
    const owners = ownersByLeague[String(u.blitzJoinedLeagueId)] || [];
    owners.forEach((owner) => {
      owner.blitz.inviteCode = u.blitzInviteCode;
    });
  });
}

export function mergePool(existing, newUsers, password) {
  const byEmail = {};
  (existing || []).forEach((u) => {
    if (u && u.email) byEmail[String(u.email).toLowerCase()] = Object.assign({}, u);
  });
  (newUsers || []).forEach((u) => {
    if (!poolEligible(u)) return;
    const key = String(u.email).toLowerCase();
    const prev = byEmail[key] || {};
    byEmail[key] = {
      email: u.email,
      username: u.username || prev.username || '',
      userId: u.userId || prev.userId || '',
      blitz: mergeBlitz(prev.blitz, u),
      exchange: mergeExchange(prev.exchange, u),
    };
  });
  stampHostInvite(byEmail, newUsers);
  return {
    password: password || PASSWORD,
    updatedAt: new Date().toISOString(),
    users: Object.keys(byEmail).sort().map((k) => byEmail[k]),
  };
}

export function removeFromPool(existing, deletedUsers, password) {
  const toRemove = new Set();
  (deletedUsers || []).forEach((u) => {
    if (u && u.email && u.result === 'ALL_PASS') {
      toRemove.add(String(u.email).toLowerCase());
    }
  });
  const remaining = (existing || []).filter(
    (u) => u && u.email && !toRemove.has(String(u.email).toLowerCase())
  );
  return {
    password: password || PASSWORD,
    updatedAt: new Date().toISOString(),
    users: remaining,
  };
}
