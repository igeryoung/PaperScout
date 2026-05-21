import crypto from 'node:crypto';

const BASE64URL = 'base64url';

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString(BASE64URL);
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest(BASE64URL);
}

export function hmacSha256(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest(BASE64URL);
}

export function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
