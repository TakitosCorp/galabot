#!/bin/bash
set -e

echo "Stopping existing containers..."
docker compose down

echo "Rebuilding and starting containers in the background..."
docker compose up --build --force-recreate -d
