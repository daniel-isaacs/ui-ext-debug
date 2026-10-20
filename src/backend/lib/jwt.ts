export interface DecodedJwt {
  header: Record<string, unknown>;
  claims: Record<string, unknown>;
  /** Human-readable versions of exp/iat/nbf. */
  times: Record<string, string>;
}

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Decodes a JWT without verifying it. Returns null when the value isn't a JWT. */
export function decodeJwt(value: string): DecodedJwt | null {
  const token = value.replace(/^Bearer\s+/i, '').trim();
  if (!JWT_PATTERN.test(token)) return null;
  const [headerPart, claimsPart] = token.split('.');
  const header = decodePart(headerPart);
  const claims = decodePart(claimsPart);
  if (!header || !claims) return null;

  const times: Record<string, string> = {};
  for (const field of ['iat', 'nbf', 'exp', 'auth_time']) {
    const seconds = claims[field];
    if (typeof seconds === 'number') times[field] = new Date(seconds * 1000).toISOString();
  }
  return {header, claims, times};
}
