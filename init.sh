set -e

echo "Stopping existing containers and removing old images..."
docker compose down --rmi local

echo "Pulling latest changes..."
git pull

echo "Rebuilding and starting containers in the background..."
docker compose up --build --force-recreate -d
