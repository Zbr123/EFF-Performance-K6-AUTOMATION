import { gql, httpOk, isSuccessCode } from '../core/http.client.js';

export const Q_SIGNUP = `mutation SignUp($first_name: String!, $last_name: String!, $username: String!, $email: String!, $address: AddressInput!, $dob: String!, $phone: String, $heard_about_us: String, $profile_picture: String, $referral_code: String) { signUp(first_name: $first_name, last_name: $last_name, username: $username, email: $email, address: $address, dob: $dob, phone: $phone, heard_about_us: $heard_about_us, profile_picture: $profile_picture, referral_code: $referral_code) { statusCode message email temporarySignupKey } }`;

export const Q_SET_PASSWORD = `mutation SetPassword($email: String!, $resetKey: String!, $password: String!) { setPassword(email: $email, resetKey: $resetKey, password: $password) { statusCode message email } }`;

export const Q_VERIFY_EMAIL = `mutation VerifyEmail($verifyKey: String!) { verifyEmail(verifyKey: $verifyKey) { statusCode message } }`;

export const Q_LOGIN = `mutation Login($email: String!, $password: String!) { login(email: $email, password: $password) { statusCode accessToken refreshToken user { _id email first_name last_name username phone dob address { state } heard_about_us profile_picture sys_dateCreated sys_dateModified sys_deleted sys_userCreated_id sys_userCreatedName sys_userModified_id sys_userModifiedName last_login role } } }`;

export const Q_DELETE_USER_BY_EMAIL = `mutation DeleteUserAccountByEmail($email: String!) { deleteUserAccountByEmail(email: $email) { statusCode message email role } }`;

export function signUp(identity, ctx) {
  return gql(Q_SIGNUP, {
    first_name: identity.first_name,
    last_name: identity.last_name,
    username: identity.username,
    email: identity.email,
    address: { state: identity.state },
    dob: identity.dob,
    heard_about_us: identity.heard_about_us || 'Other',
    profile_picture: identity.profile_picture || 'icon_bear',
  }, null, 'signUp', ctx);
}

export function setPassword(email, resetKey, password, ctx) {
  return gql(Q_SET_PASSWORD, { email, resetKey, password }, null, 'setPassword', ctx);
}

export function verifyEmail(email, ctx) {
  return gql(Q_VERIFY_EMAIL, { verifyKey: `TEST_BYPASS::${email}` }, null, 'verifyEmail', ctx);
}

export function login(email, password, ctx) {
  return gql(Q_LOGIN, { email, password }, null, 'login', ctx);
}

export function deleteUserAccountByEmail(email, token, ctx) {
  return gql(Q_DELETE_USER_BY_EMAIL, { email }, token, 'deleteUserAccountByEmail', ctx);
}

export function signupOk(resp) {
  const data = resp.body && resp.body.signUp;
  return httpOk(resp) && !!(data && data.temporarySignupKey);
}

export function setPasswordOk(resp) {
  const data = resp.body && resp.body.setPassword;
  return httpOk(resp) && isSuccessCode(data);
}

export function verifyEmailOk(resp) {
  const data = resp.body && resp.body.verifyEmail;
  return httpOk(resp) && isSuccessCode(data);
}

export function loginOk(resp) {
  const data = resp.body && resp.body.login;
  return httpOk(resp) && !!(data && data.accessToken);
}

export function deleteUserOk(resp) {
  const data = resp.body && resp.body.deleteUserAccountByEmail;
  return httpOk(resp) && isSuccessCode(data);
}
