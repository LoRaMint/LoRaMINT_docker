import { up } from "./migrations/001-initial-schema"

console.log("Running migrations...")
await up()
console.log("Migrations complete.")
process.exit(0)
