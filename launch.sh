#!/bin/bash
git pull

docker compose down --rmi all

docker compose build

docker compose up -d
