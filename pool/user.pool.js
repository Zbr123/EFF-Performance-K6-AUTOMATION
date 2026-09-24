import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { JOIN_HOST_EMAIL, JOIN_INVITE_CODE, PASSWORD } from '../config/env.config.js';
import { login, loginOk } from '../graphql/auth.graphql.js';
import {
  fetchBlitzInviteCode,
  findBlitzLeagueByOwnerAndInvite,
  getPublicBlitzLeagues,
  getPublicBlitzLeaguesOk,
  pickPublicBlitzLeague,
} from '../graphql/blitz.graphql.js';

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

const poolFile = parsePoolFile(rawPoolFile);
console.log(`[pool] loaded ${poolFile.users.length} users from data/users.json`);

const poolSnapshot = new SharedArray('user-pool', function () {
  return poolFile.users.map((u) => ({
    email: u.email,
    username: u.username || '',
    userId: u.userId || u.user_id || '',
    blitz: u.blitz || emptyBlitz(),
    exchange: u.exchange || { leagueId: null, teamId: null },
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

export function pickUser(users, iterationInTest, unique) {
  if (!users || !users.length) return null;
  if (unique) {
    if (iterationInTest >= users.length) return null;
    return users[iterationInTest];
  }
  return users[iterationInTest % users.length];
}

function emailKey(value) {
  return String(value || '').toLowerCase();
}

function isOwner(user) {
  return !!(user && user.blitz && user.blitz.leagueId && user.blitz.teamId);
}

function pickHost(users) {
  if (JOIN_HOST_EMAIL) {
    const host = users.find((u) => emailKey(u.email) === emailKey(JOIN_HOST_EMAIL));
    if (!host) {
      exec.test.abort(`JOIN_HOST_EMAIL=${JOIN_HOST_EMAIL} is not in data/users.json`);
    }
    return host;
  }

  const host = users.find(isOwner);
  if (!host) {
    exec.test.abort(
      'No JOIN_HOST_EMAIL set, and no pool user has blitz.leagueId + blitz.teamId. ' +
      'Run first: k6 run main.js -e SUITE=blitz-owner-setup -e ITERATIONS=1'
    );
  }
  return host;
}

export function resolveJoinHost(users, password) {
  if (JOIN_INVITE_CODE) {
    console.log(`Join inviteCode=${JOIN_INVITE_CODE} joiners=${users.length} (host not in pool)`);
    return { inviteCode: JOIN_INVITE_CODE, users: users };
  }

  const host = pickHost(users);
  const leagueId = host.blitz && host.blitz.leagueId ? String(host.blitz.leagueId) : '';
  if (!leagueId) {
    exec.test.abort(
      `Host ${host.email} has no blitz.leagueId. Run first: k6 run main.js -e SUITE=blitz-create-league`
    );
  }
  if (!host.blitz.teamId) {
    exec.test.abort(
      `Host ${host.email} has league ${leagueId} but no owner team. ` +
      'Run first: k6 run main.js -e SUITE=blitz-create-team -e ITERATIONS=1'
    );
  }

  let inviteCode = host.blitz.inviteCode ? String(host.blitz.inviteCode) : '';
  if (!inviteCode) {
    const loginResp = login(host.email, password, 'setup');
    if (!loginOk(loginResp)) {
      exec.test.abort(`Host login failed for ${host.email}`);
    }
    inviteCode = fetchBlitzInviteCode(leagueId, loginResp.body.login.accessToken, 'setup');
    if (!inviteCode) {
      exec.test.abort(`Host league ${leagueId} returned no Invite_Code for ${host.email}`);
    }
  }

  const joiners = users.filter((u) => {
    if (emailKey(u.email) === emailKey(host.email)) return false;
    const joinedId = u.blitz && u.blitz.joinedLeagueId ? String(u.blitz.joinedLeagueId) : '';
    return joinedId !== leagueId;
  });

  console.log(
    `Join host=${host.email} leagueId=${leagueId} inviteCode=${inviteCode} joiners=${joiners.length}`
  );

  return { inviteCode, users: joiners };
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

function teamInLeague(user, leagueId) {
  const want = String(leagueId || '');
  const blitz = user && user.blitz;
  if (!blitz || !want) return false;
  if (String(blitz.leagueId || '') === want && blitz.teamId) return true;
  if (String(blitz.joinedLeagueId || '') === want && blitz.joinedTeamId) return true;
  return false;
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
    'Join that league first: k6 run main.js -e SUITE=blitz-join-league -e JOIN_INVITE_CODE=' +
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
      'Join first: k6 run main.js -e SUITE=blitz-join-league -e JOIN_INVITE_CODE=' +
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
      joinedTeamId: poolVal(u.blitzTeamId) || prev.joinedTeamId || null,
      joinedTeamName: poolVal(u.blitzTeamName) || prev.joinedTeamName || null,
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
  (newUsers || []).forEach((u) => {
    if (!u || u.result !== 'ALL_PASS' || !u.blitzJoinedLeagueId || !u.blitzInviteCode) return;
    const joinedId = String(u.blitzJoinedLeagueId);
    Object.keys(byEmail).forEach((k) => {
      const owner = byEmail[k];
      if (owner.blitz && String(owner.blitz.leagueId) === joinedId) {
        owner.blitz.inviteCode = u.blitzInviteCode;
      }
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
    const prevExchange = prev.exchange || {};
    byEmail[key] = {
      email: u.email,
      username: u.username || prev.username || '',
      userId: u.userId || prev.userId || '',
      blitz: mergeBlitz(prev.blitz, u),
      exchange: {
        leagueId: prevExchange.leagueId || null,
        teamId: prevExchange.teamId || null,
      },
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
