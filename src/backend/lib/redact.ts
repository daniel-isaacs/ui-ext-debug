import {decodeJwt, DecodedJwt} from './jwt';

const SENSITIVE_HEADER = /(authorization|cookie|token|secret|signature|api[-_]?key|password|session)/i;

/** Keeps the start of a secret so you can tell values apart, and hides the rest. */
export function mask(value: string): string {
  if (value.length <= 12) return `•••• (${value.length} chars)`;
  return `${value.slice(0, 10)}… (${value.length} chars)`;
}

export interface HeaderReport {
  headers: Record<string, string>;
  /** Decoded claims of any header value that is a JWT. Signatures are never included. */
  jwts: Record<string, DecodedJwt>;
}

export function reportHeaders(pairs: string[][]): HeaderReport {
  const headers: Record<string, string> = {};
  const jwts: Record<string, DecodedJwt> = {};
  for (const [rawName, rawValue] of pairs) {
    const name = rawName.toLowerCase();
    const value = rawValue ?? '';
    const decoded = decodeJwt(value);
    if (decoded) jwts[name] = decoded;
    const shown = SENSITIVE_HEADER.test(name) || decoded ? mask(value) : value;
    headers[name] = headers[name] ? `${headers[name]}, ${shown}` : shown;
  }
  return {headers, jwts};
}

/** Lists environment variables. Values are shown only for an allow-list of harmless names. */
export function reportEnv(): {visible: Record<string, string>; names: string[]} {
  const SAFE = /^(NODE_ENV|NODE_VERSION|TZ|LANG|APP_VERSION|ZAIUS_ENV|LOG_LEVEL|LOG_MAX_MESSAGE_LENGTH|AWS_REGION|AWS_DEFAULT_REGION|AWS_EXECUTION_ENV|AWS_LAMBDA_FUNCTION_MEMORY_SIZE|K_SERVICE|K_REVISION|HOSTNAME|PORT)$/;
  const visible: Record<string, string> = {};
  const names = Object.keys(process.env).sort();
  for (const name of names) {
    if (SAFE.test(name)) visible[name] = process.env[name] ?? '';
  }
  return {visible, names};
}
