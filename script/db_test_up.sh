#!/bin/bash
# Start PostgreSQL 16 test database in Docker
# Creates container 'fieldcopilot_test_db' on port 5433

set -e

CONTAINER_NAME="fieldcopilot_test_db"
DB_NAME="fieldcopilot_test"
DB_USER="postgres"
DB_PASSWORD="postgres"
PORT="5433"

echo "Starting test database container..."

# Check if container exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Container ${CONTAINER_NAME} exists. Restarting..."
  docker start ${CONTAINER_NAME} > /dev/null 2>&1 || docker restart ${CONTAINER_NAME} > /dev/null 2>&1
else
  echo "Creating new container ${CONTAINER_NAME}..."
  docker run -d \
    --name ${CONTAINER_NAME} \
    -e POSTGRES_USER=${DB_USER} \
    -e POSTGRES_PASSWORD=${DB_PASSWORD} \
    -e POSTGRES_DB=${DB_NAME} \
    -p ${PORT}:5432 \
    postgres:16 \
    > /dev/null 2>&1
fi

# Wait for database to be ready
echo "Waiting for database to be ready..."
sleep 2
for i in {1..30}; do
  if docker exec ${CONTAINER_NAME} pg_isready -U ${DB_USER} > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Create database if it doesn't exist
docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 || \
  docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -c "CREATE DATABASE ${DB_NAME}"

echo ""
echo "✅ Test database is ready!"
echo ""
echo "Set this in your .env file:"
echo "DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PORT}/${DB_NAME}"
echo ""
echo "Or export it:"
echo "export DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PORT}/${DB_NAME}"
echo ""

