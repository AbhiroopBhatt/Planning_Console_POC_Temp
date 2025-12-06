#!/bin/bash

# Restart All Services Script
# This script stops and restarts all services for Planning Console AI
# Usage: ./restart-all.sh

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Planning Console AI - Service Restart"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Step 1: Stop all running services
print_status "Step 1: Stopping all running services..."
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "tsx.*backend" 2>/dev/null || true
sleep 2
print_status "Services stopped"

# Step 2: Stop Docker containers
print_status "Step 2: Stopping Docker containers..."
docker-compose down 2>/dev/null || true
print_status "Docker containers stopped"

# Step 3: Start Docker containers
print_status "Step 3: Starting Docker containers..."
docker-compose up -d

# Wait for containers to be healthy
print_status "Waiting for databases to be ready..."
MAX_WAIT=60
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if docker ps | grep -q "planning_console_postgres.*healthy" && \
       docker ps | grep -q "planning_console_neo4j.*healthy"; then
        print_status "Databases are healthy!"
        break
    fi
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
    echo -n "."
done
echo ""

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    print_warning "Databases may not be fully ready, but continuing..."
fi

# Step 4: Start backend server
print_status "Step 4: Starting backend server..."
cd "$SCRIPT_DIR/backend"
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found, installing dependencies..."
    npm install --ignore-scripts 2>&1 | tail -5
fi

# Kill any existing backend processes
pkill -f "tsx.*backend" 2>/dev/null || true
sleep 1

# Start backend in background
npm run dev > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/backend.pid
print_status "Backend server starting (PID: $BACKEND_PID)"
print_status "Backend logs: tail -f /tmp/backend.log"

# Wait for backend to be ready
print_status "Waiting for backend to be ready..."
MAX_WAIT=30
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s http://localhost:3001/api/duckdb/status > /dev/null 2>&1; then
        print_status "Backend is ready!"
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    echo -n "."
done
echo ""

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    print_warning "Backend may not be fully ready, but continuing..."
    print_warning "Check logs: tail -f /tmp/backend.log"
fi

# Step 5: Start frontend server
print_status "Step 5: Starting frontend server..."
cd "$SCRIPT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found, installing dependencies..."
    npm install 2>&1 | tail -5
fi

# Kill any existing frontend processes
pkill -f "next dev" 2>/dev/null || true
sleep 1

# Start frontend in background
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/frontend.pid
print_status "Frontend server starting (PID: $FRONTEND_PID)"
print_status "Frontend logs: tail -f /tmp/frontend.log"

# Wait for frontend to be ready
print_status "Waiting for frontend to be ready..."
MAX_WAIT=30
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        print_status "Frontend is ready!"
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    echo -n "."
done
echo ""

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    print_warning "Frontend may not be fully ready, but continuing..."
    print_warning "Check logs: tail -f /tmp/frontend.log"
fi

# Step 6: Verify all services
echo ""
print_status "Step 6: Verifying all services..."
echo ""

# Check Docker containers
echo "Docker Containers:"
if docker ps | grep -q "planning_console_postgres"; then
    POSTGRES_STATUS=$(docker ps --format "{{.Status}}" --filter "name=planning_console_postgres")
    echo -e "  ${GREEN}✓${NC} PostgreSQL: $POSTGRES_STATUS"
else
    echo -e "  ${RED}✗${NC} PostgreSQL: Not running"
fi

if docker ps | grep -q "planning_console_neo4j"; then
    NEO4J_STATUS=$(docker ps --format "{{.Status}}" --filter "name=planning_console_neo4j")
    echo -e "  ${GREEN}✓${NC} Neo4j: $NEO4J_STATUS"
else
    echo -e "  ${RED}✗${NC} Neo4j: Not running"
fi

# Check Backend
echo ""
echo "Backend API (http://localhost:3001):"
if curl -s http://localhost:3001/api/duckdb/status > /dev/null 2>&1; then
    BACKEND_STATUS=$(curl -s http://localhost:3001/api/duckdb/status | python3 -c "import sys, json; data = json.load(sys.stdin); print('Available' if data.get('available') else 'Not Available')" 2>/dev/null || echo "Running")
    echo -e "  ${GREEN}✓${NC} Backend: $BACKEND_STATUS"
else
    echo -e "  ${RED}✗${NC} Backend: Not responding"
fi

# Check Frontend
echo ""
echo "Frontend (http://localhost:3000):"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200\|307"; then
    echo -e "  ${GREEN}✓${NC} Frontend: Running"
else
    echo -e "  ${RED}✗${NC} Frontend: Not responding"
fi

# Summary
echo ""
echo "=========================================="
echo "Restart Complete!"
echo "=========================================="
echo ""
echo "Services:"
echo "  - Backend:  http://localhost:3001 (PID: $BACKEND_PID)"
echo "  - Frontend: http://localhost:3000 (PID: $FRONTEND_PID)"
echo "  - PostgreSQL: localhost:5432"
echo "  - Neo4j Browser: http://localhost:7474"
echo ""
echo "Logs:"
echo "  - Backend:  tail -f /tmp/backend.log"
echo "  - Frontend: tail -f /tmp/frontend.log"
echo ""
echo "To stop all services:"
echo "  ./stop-all.sh"
echo ""

