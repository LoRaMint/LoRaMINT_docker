import { sql } from "bun"

export const up = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS measurements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_eui VARCHAR(16) NOT NULL,
      measurand VARCHAR(40) NOT NULL,
      unit VARCHAR(40) NOT NULL,
      datatype VARCHAR(10) NOT NULL CHECK (datatype IN ('float', 'integer', 'string')),
      sensor VARCHAR(40) NOT NULL,
      location VARCHAR(40) NOT NULL,
      value TEXT NOT NULL,
      time_method VARCHAR(10) NOT NULL CHECK (time_method IN ('server', 'custom', 'none')),
      recorded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple()

  await sql`
    CREATE TABLE IF NOT EXISTS log_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_eui VARCHAR(16) NOT NULL,
      message VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple()
}
