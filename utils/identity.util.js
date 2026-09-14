import { randomString } from './random.util.js';
import { EMAIL_DOMAIN, EMAIL_PREFIX } from '../config/env.config.js';

export function makeIdentity() {
  const unique = `${Date.now()}${__VU}${__ITER}${randomString(4)}`.toLowerCase();
  return {
    first_name: 'Load',
    last_name: 'Test',
    username: `fw_${unique}`.substring(0, 24),
    email: `${EMAIL_PREFIX}+fw_${unique}@${EMAIL_DOMAIN}`,
    dob: '2000-10-30',
    state: 'TX',
    heard_about_us: 'Other',
    profile_picture: 'icon_bear',
  };
}
