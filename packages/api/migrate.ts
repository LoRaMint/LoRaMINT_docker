import { up as initialSchema } from "./migrations/001-initial-schema"
import { up as auditLog } from "./migrations/002-audit-log"
import { up as auditRevert } from "./migrations/003-audit-revert"
import { up as deviceLog } from "./migrations/004-device-log"
import { up as settings } from "./migrations/005-settings"
import { up as users } from "./migrations/006-users"
import { up as measurementGroups } from "./migrations/007-measurement-groups"
import { up as dashboardEntries } from "./migrations/008-dashboard-entries"

// There is no migrations table: every migration runs on every start, so each
// one has to be idempotent (CREATE ... IF NOT EXISTS). A new file is added here
// by hand, in order.
console.log("Running migrations...")
await initialSchema()
await auditLog()
await auditRevert()
await deviceLog()
await settings()
await users()
await measurementGroups()
await dashboardEntries()
console.log("Migrations complete.")
process.exit(0)
