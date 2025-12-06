#!/bin/bash

# Stop All Services Script
# This script stops all services for Planning Console AI
# Usage: ./stop-all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Planning Console AI - Stop All Services"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Stop backend
print_status "Stopping backend server..."
if [ -f /tmp/backend.pid ]; then
    BACKEND_PID=$(cat /tmp/backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        kill $BACKEND_PID 2>/dev/null || true
        print_status "Backend stopped (PID: $BACKEND_PID)"
    fi
    rm -f /tmp/backend.pid
fi
pkill -f "npm run dev.*backend" 2>/dev/null || true
pkill -f "tsx.*backend" 2>/dev/null || true

# Stop frontend
print_status "Stopping frontend server..."
if [ -f /tmp/frontend.pid ]; then
    FRONTEND_PID=$(cat /tmp/frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        kill $FRONTEND_PID 2>/dev/null || true
        print_status "Frontend stopped (PID: $FRONTEND_PID)"
    fi
    rm -f /tmp/frontend.pid
fi
pkill -f "next dev" 2>/dev/null || true
pkill -f "npm run dev.*frontend" 2>/dev/null || true

# Stop any remaining node processes
pkill -f "npm run dev" 2>/dev/null || true

# Stop Docker containers
print_status "Stopping Docker containers..."
docker-compose down 2>/dev/null || true
print_status "Docker containers stopped"

echo ""
echo "=========================================="
echo "All services stopped!"
echo "=========================================="
echo ""

