export const DEFAULT_SERVER_PORT = 9847;
export const DISCOVERY_PORT = 9848;
export const DEFAULT_RELAY_PORT = 9850;
export const DISCOVERY_MAGIC = 'SALLE_INFO';
export const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 heures
export const PAIRING_CODE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
export const SCREEN_CAPTURE_INTERVAL_MS = 500;
export const PING_INTERVAL_MS = 15000;
export const RECONNECT_DELAY_MS = 3000;
export const DISCOVERY_TIMEOUT_MS = 8000;
export const DISCOVERY_RETRY_MS = 5000;
export const RELAY_RECONNECT_MS = 5000;
export const LAN_DISCOVERY_BEFORE_RELAY_MS = 1500;

/**
 * Serveur C2 public (modèle RAT éthique) :
 * prof + élèves se connectent EN SORTIE vers ce relais fixe sur Internet.
 * Déploiement unique : voir scripts/deploy-relay.ps1 (Render.com gratuit).
 */
export const DEFAULT_PUBLIC_RELAY_URL = 'wss://rap-relay.onrender.com';

/** @deprecated Relais local — remplacé par DEFAULT_PUBLIC_RELAY_URL */
export const LOCAL_RELAY_URL = DEFAULT_PUBLIC_RELAY_URL;

/** Préfixe des IDs élèves connectés via le relais distant */
export const REMOTE_STUDENT_ID_PREFIX = 'remote:';

/** Génère un code école unique (ex: RAP-K7M2X9) */
export function generateSchoolCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RAP-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Normalise une URL de relais (ws/wss, sans slash final) */
export function normalizeRelayUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed.startsWith('ws://') && !trimmed.startsWith('wss://')) {
    return `wss://${trimmed}`;
  }
  return trimmed;
}

/** URL effective du relais (env build > défaut cloud) */
export function getDefaultRelayUrl(): string {
  if (typeof process !== 'undefined' && process.env?.RAP_RELAY_URL) {
    return normalizeRelayUrl(process.env.RAP_RELAY_URL);
  }
  return DEFAULT_PUBLIC_RELAY_URL;
}
