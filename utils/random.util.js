export function randomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const n = length || 4;
  let out = '';
  for (let i = 0; i < n; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
