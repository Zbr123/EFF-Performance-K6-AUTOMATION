import { SharedArray } from 'k6/data';
import { PASSWORD } from '../config/env.config.js';

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

const poolFile = parsePoolFile(rawPoolFile);
console.log(`[pool] loaded ${poolFile.users.length} users from data/users.json`);

const poolSnapshot = new SharedArray('user-pool', function () {
  return poolFile.users.map((u) => ({
    email: u.email,
    username: u.username || '',
    userId: u.userId || u.user_id || '',
    blitz: u.blitz || { leagueId: null, teamId: null },
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

export function mergePool(existing, newUsers, password) {
  const byEmail = {};
  (existing || []).forEach((u) => {
    if (u && u.email) byEmail[String(u.email).toLowerCase()] = Object.assign({}, u);
  });
  (newUsers || []).forEach((u) => {
    if (!u || !u.email || u.result !== 'ALL_PASS') return;
    const key = String(u.email).toLowerCase();
    const prev = byEmail[key] || {};
    byEmail[key] = {
      email: u.email,
      username: u.username || prev.username || '',
      userId: u.userId || prev.userId || '',
      blitz: prev.blitz || { leagueId: null, teamId: null },
      exchange: prev.exchange || { leagueId: null, teamId: null },
    };
  });
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
