import { createHash, timingSafeEqual } from "node:crypto";

const requireEnv = (key: string) => {
  const value = Bun.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const config = {
  appKey: requireEnv("TTN_APP_KEY"),
  port: parseInt(Bun.env.PORT ?? "8090", 10),
};

const appKeyHash = createHash("sha256").update(config.appKey).digest();

/**
 * Constant-time comparison of a candidate webhook key against TTN_APP_KEY.
 * Both sides are hashed to a fixed length first, so neither the result nor the
 * key length leaks through timing.
 */
export const verifyAppKey = (candidate: string | undefined): boolean => {
  if (!candidate) return false;
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    appKeyHash,
  );
};

export const legal = {
  impressum: Bun.env.LEGAL_IMPRESSUM ?? null,
  datenschutz: Bun.env.LEGAL_DATENSCHUTZ ?? null,
};
