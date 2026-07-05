export const DISCOVERY_MESSAGE = {
  DISCOVER: 'RAP_DISCOVER',
  ANNOUNCE: 'RAP_ANNOUNCE',
} as const;

export interface DiscoveryDiscoverPayload {
  type: typeof DISCOVERY_MESSAGE.DISCOVER;
  version: 1;
}

export interface DiscoveryAnnouncePayload {
  type: typeof DISCOVERY_MESSAGE.ANNOUNCE;
  version: 1;
  ip: string;
  port: number;
  hostname: string;
}

export function parseDiscoveryMessage(raw: string): DiscoveryDiscoverPayload | DiscoveryAnnouncePayload | null {
  try {
    const data = JSON.parse(raw);
    if (data?.type === DISCOVERY_MESSAGE.DISCOVER || data?.type === DISCOVERY_MESSAGE.ANNOUNCE) {
      return data;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getSubnetBroadcasts(): string[] {
  const os = require('os') as typeof import('os');
  const broadcasts = new Set<string>(['255.255.255.255', '127.0.0.1']);

  for (const iface of Object.values(os.networkInterfaces())) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      broadcasts.add(addr.address);
      if (addr.netmask) {
        const ipParts = addr.address.split('.').map(Number);
        const maskParts = addr.netmask.split('.').map(Number);
        const broadcast = ipParts.map((p, i) => p | (~maskParts[i] & 255)).join('.');
        broadcasts.add(broadcast);
      }
    }
  }

  return Array.from(broadcasts);
}

export function getLocalIpv4Addresses(): string[] {
  const os = require('os') as typeof import('os');
  const ips: string[] = ['127.0.0.1'];
  for (const iface of Object.values(os.networkInterfaces())) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return ips;
}

export function getLocalIpAddress(): string {
  const ips = getLocalIpv4Addresses().filter((ip) => ip !== '127.0.0.1');
  return ips[0] ?? '127.0.0.1';
}
