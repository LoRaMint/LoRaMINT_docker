#!/bin/bash

echo "Starting LoRaMINT..."

# Run migrations
bun run migrate.ts

if [ $? -ne 0 ]; then
    echo "Migration failed! Exiting..."
    exit 1
fi

# Create or refresh the restricted database roles the optional features connect
# through. After the migrations, because the grants need the tables. A role
# whose DATABASE_URL_* is unset is skipped, so this does nothing on a deployment
# that uses none of them.
bun run scripts/ensure-roles.ts

if [ $? -ne 0 ]; then
    echo "Database role setup failed! Exiting..."
    exit 1
fi

# Start the server
echo "Starting server..."
exec bun run index.ts
