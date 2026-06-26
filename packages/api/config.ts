const requireEnv = (key: string) => {
  const value = Bun.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const config = {
  appKey: requireEnv("TTN_APP_KEY"),
  port: parseInt(Bun.env.PORT ?? "8090", 10),
};

export const legal = {
  impressum: Bun.env.LEGAL_IMPRESSUM ?? null,
  datenschutz: Bun.env.LEGAL_DATENSCHUTZ ?? null,
};
