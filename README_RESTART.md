# Service Management Scripts

This directory contains scripts to manage all Planning Console AI services.

## Quick Start

### Restart All Services
```bash
./restart-all.sh
```

This will:
1. Stop all running services (backend, frontend)
2. Stop Docker containers (PostgreSQL, Neo4j)
3. Start Docker containers and wait for them to be healthy
4. Start backend server (port 3001)
5. Start frontend server (port 3000)
6. Verify all services are running

### Stop All Services
```bash
./stop-all.sh
```

This will:
1. Stop backend server
2. Stop frontend server
3. Stop Docker containers

## Service URLs

After running `./restart-all.sh`, services will be available at:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Neo4j Browser**: http://localhost:7474
- **PostgreSQL**: localhost:5432

## Logs

View service logs:

```bash
# Backend logs
tail -f /tmp/backend.log

# Frontend logs
tail -f /tmp/frontend.log

# Docker container logs
docker-compose logs -f
```

## Manual Service Management

If you prefer to manage services manually:

### Start Docker Containers
```bash
docker-compose up -d
```

### Start Backend
```bash
cd backend
npm run dev > /tmp/backend.log 2>&1 &
```

### Start Frontend
```bash
cd frontend
npm run dev > /tmp/frontend.log 2>&1 &
```

### Stop Services
```bash
# Stop backend and frontend
pkill -f "npm run dev"
pkill -f "next dev"
pkill -f "tsx.*backend"

# Stop Docker containers
docker-compose down
```

## Troubleshooting

### Services don't start
1. Check if ports are already in use:
   ```bash
   lsof -i :3000  # Frontend
   lsof -i :3001  # Backend
   lsof -i :5432  # PostgreSQL
   lsof -i :7474  # Neo4j HTTP
   lsof -i :7687  # Neo4j Bolt
   ```

2. Check Docker containers:
   ```bash
   docker ps
   docker-compose logs
   ```

3. Check service logs:
   ```bash
   tail -f /tmp/backend.log
   tail -f /tmp/frontend.log
   ```

### Databases not ready
If databases take longer than expected:
```bash
# Check container health
docker ps

# Check specific container logs
docker logs planning_console_postgres
docker logs planning_console_neo4j

# Restart containers
docker-compose restart
```

### Backend/Frontend not responding
1. Check if processes are running:
   ```bash
   ps aux | grep -E "npm run dev|next dev|tsx.*backend"
   ```

2. Check if ports are listening:
   ```bash
   netstat -an | grep -E "3000|3001"
   ```

3. Restart the specific service:
   ```bash
   # Kill and restart backend
   pkill -f "tsx.*backend"
   cd backend && npm run dev > /tmp/backend.log 2>&1 &
   
   # Kill and restart frontend
   pkill -f "next dev"
   cd frontend && npm run dev > /tmp/frontend.log 2>&1 &
   ```

## Script Details

### restart-all.sh
- Stops all existing services
- Stops and restarts Docker containers
- Waits for databases to be healthy
- Starts backend and frontend servers
- Verifies all services are running
- Provides status summary

### stop-all.sh
- Stops backend server (by PID if available)
- Stops frontend server (by PID if available)
- Stops all npm/node processes
- Stops Docker containers

## Environment Variables

Make sure you have the following environment variables set (in `backend/.env` and `frontend/.env`):

```env
# Backend .env
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=pc_postgres_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=planning_console_neo4j_2024
NEO4J_DATABASE=pc-neo4j-poc
```

## Next Steps After Restart

1. **Build Graph Database** (if not already built):
   - Go to Admin > Setup > Hierarchy Management
   - Select tables as nodes
   - Define relationships
   - Click "Build Graph"
   - This creates rollup views in DuckDB

2. **Create Fact Table Views**:
   ```bash
   curl -X POST http://localhost:3001/api/duckdb/create-fact-views \
     -H "Content-Type: application/json"
   ```

3. **Access the Application**:
   - Frontend: http://localhost:3000
   - Admin Panel: http://localhost:3000/admin

