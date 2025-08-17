#!/bin/bash
set -e

echo "Deteniendo contenedores existentes..."
docker compose down

echo "Reconstruyendo e iniciando contenedores en segundo plano..."
docker compose up --build --force-recreate -d