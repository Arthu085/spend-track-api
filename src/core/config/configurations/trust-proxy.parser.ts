import { isIP } from 'node:net';

export type TrustProxySetting = false | number | string[];

const PROXY_ADDRESS_PRESETS = ['loopback', 'linklocal', 'uniquelocal'];

const MAX_PREFIX_LENGTH: Record<number, number> = { 4: 32, 6: 128 };

const isPrefixLength = (value: string, ipVersion: number): boolean =>
  /^\d+$/.test(value) &&
  Number(value) > 0 &&
  Number(value) <= MAX_PREFIX_LENGTH[ipVersion];

const isProxyAddress = (entry: string): boolean => {
  if (PROXY_ADDRESS_PRESETS.includes(entry)) {
    return true;
  }

  const [address, prefixLength, ...rest] = entry.split('/');
  const ipVersion = isIP(address);

  if (ipVersion === 0 || rest.length > 0) {
    return false;
  }

  return prefixLength === undefined || isPrefixLength(prefixLength, ipVersion);
};

export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = (raw ?? '').trim().toLowerCase();

  if (value === '' || value === 'false') {
    return false;
  }

  if (value === 'true') {
    throw new Error(
      'TRUST_PROXY=true trusts any client-supplied X-Forwarded-For; use a hop count or proxy addresses instead',
    );
  }

  if (/^\d+$/.test(value)) {
    const hops = Number(value);

    return hops === 0 ? false : hops;
  }

  const entries = value.split(',').map((entry) => entry.trim());
  const invalidEntry = entries.find((entry) => !isProxyAddress(entry));

  if (invalidEntry !== undefined) {
    throw new Error(
      `TRUST_PROXY entry "${invalidEntry}" must be loopback, linklocal, uniquelocal, an IP address, or a CIDR range`,
    );
  }

  return entries;
}
