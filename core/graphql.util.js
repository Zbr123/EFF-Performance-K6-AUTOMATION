import { httpOk, isSuccessCode } from './http.client.js';

export function responseField(resp, key) {
  return resp && resp.body ? resp.body[key] : null;
}

export function payloadOk(resp, key, extra) {
  const data = responseField(resp, key);
  return httpOk(resp) && isSuccessCode(data) && (!extra || extra(data));
}
