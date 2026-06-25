#!/bin/bash

echo "Starting LoRaMINT..."

# Run migrations
bun run migrate.ts

if [ $? -ne 0 ]; then
    echo "Migration failed! Exiting..."
    exit 1
fi

# Start the server
echo "Starting server..."
exec bun run index.ts
