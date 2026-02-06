const requireEnv = (key: string) => {
  const value = Bun.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const config = {
  appKey: requireEnv("TTN_APP_KEY"),
  port: parseInt(Bun.env.PORT ?? "8090", 10),
};
