import { randomString } from './random.util.js';

export function textValue(value) {
  return value == null ? '' : String(value);
}

export function requirePoolUser(ctx, scenarioName) {
  const user = ctx.user;
  if (!user || !user.email) {
    throw new Error(`Scenario "${scenarioName}" needs a pool user with an email.`);
  }
  return user;
}

export function requireToken(ctx, scenarioName) {
  const token = ctx.data && ctx.data.token;
  if (!token) {
    throw new Error(
      `Scenario "${scenarioName}" needs ctx.data.token. ` +
      'Put login or signup before it in the suite.'
    );
  }
  return token;
}

export function requireData(ctx, key, scenarioName, description) {
  const value = ctx.data && ctx.data[key] ? String(ctx.data[key]) : '';
  if (!value) {
    throw new Error(`Scenario "${scenarioName}" needs ${description || `ctx.data.${key}`}.`);
  }
  return value;
}

export function uniqueTestName(prefix, maxLength = 50) {
  return `${prefix} ${Date.now()}${__VU}${__ITER}${randomString(3)}`.substring(0, maxLength);
}
