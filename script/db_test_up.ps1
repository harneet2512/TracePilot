# Start PostgreSQL 16 test database in Docker
# Creates container 'fieldcopilot_test_db' on port 5433

$CONTAINER_NAME = "fieldcopilot_test_db"
$DB_NAME = "fieldcopilot_test"
$DB_USER = "postgres"
$DB_PASSWORD = "postgres"
$PORT = "5433"

Write-Host "Starting test database container..." -ForegroundColor Cyan

# Check if container exists
$containerExists = docker ps -a --format '{{.Names}}' | Select-String -Pattern "^${CONTAINER_NAME}$"

if ($containerExists) {
    Write-Host "Container ${CONTAINER_NAME} exists. Restarting..." -ForegroundColor Yellow
    docker start ${CONTAINER_NAME} 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        docker restart ${CONTAINER_NAME} 2>&1 | Out-Null
    }
} else {
    Write-Host "Creating new container ${CONTAINER_NAME}..." -ForegroundColor Green
    docker run -d `
        --name ${CONTAINER_NAME} `
        -e POSTGRES_USER=${DB_USER} `
        -e POSTGRES_PASSWORD=${DB_PASSWORD} `
        -e POSTGRES_DB=${DB_NAME} `
        -p ${PORT}:5432 `
        postgres:16 `
        2>&1 | Out-Null
}

# Wait for database to be ready
Write-Host "Waiting for database to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

$maxAttempts = 30
$attempt = 0
$ready = $false

while ($attempt -lt $maxAttempts) {
    $result = docker exec ${CONTAINER_NAME} pg_isready -U ${DB_USER} 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
    $attempt++
}

# Create database if it doesn't exist
$dbExists = docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" 2>&1
if ($dbExists -notmatch "1") {
    docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -c "CREATE DATABASE ${DB_NAME}" 2>&1 | Out-Null
}

Write-Host ""
Write-Host "✅ Test database is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Set this in your .env file:" -ForegroundColor Yellow
Write-Host "DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PORT}/${DB_NAME}"
Write-Host ""
Write-Host "Or set it in PowerShell:" -ForegroundColor Yellow
Write-Host "`$env:DATABASE_URL='postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PORT}/${DB_NAME}'"
Write-Host ""

