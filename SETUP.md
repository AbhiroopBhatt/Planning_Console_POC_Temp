# Setup Guide

## Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for databases)
- Python 3.9+ (for ML models, optional)

## Quick Start

### 1. Install Dependencies

**Note:** DuckDB may fail to install on Node.js v25. This is okay - the app will use PostgreSQL as a fallback.

```bash
# Option 1: Install all (may show DuckDB errors, but will continue)
npm run install:all

# Option 2: Install without DuckDB (recommended if you see errors)
cd backend && npm install --ignore-scripts && cd ../frontend && npm install && cd ..
```

See [INSTALL_FIX.md](./INSTALL_FIX.md) for more details on DuckDB installation issues.

### 2. Start Databases

```bash
docker-compose up -d
```

This will start:
- PostgreSQL on port 5432
- Neo4j on ports 7474 (HTTP) and 7687 (Bolt)

### 3. Configure Environment Variables

Copy the example environment files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Update the database connection strings if needed.

### 4. Run Migrations and Seed Data

```bash
cd backend
npm run migrate
npm run seed
```

### 5. Start Development Servers

From the root directory:

```bash
npm run dev
```

This will start:
- Backend API on http://localhost:3001
- Frontend on http://localhost:3000

## Database Setup

### PostgreSQL

The migrations will create all necessary tables. The seed script will populate initial data from the CSV files in `db/Seed/`.

### Neo4j

**Database:** `pc-neo4j-poc`

Neo4j will be available at:
- Browser: http://localhost:7474
- Bolt: bolt://localhost:7687
- Username: `neo4j`
- Password: `planning_console_neo4j_2024`
- Database: `pc-neo4j-poc`

**Environment Variables:**
```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=planning_console_neo4j_2024
NEO4J_DATABASE=pc-neo4j-poc
```

Use the Hierarchy Management UI in the Admin panel to sync hierarchies to Neo4j.

**Note:** See [DATABASE_ACCESS.md](./DATABASE_ACCESS.md) for complete database access information.

### DuckDB

DuckDB database file will be created automatically at `backend/duckdb/planning_console.duckdb`.

## Project Structure

```
├── backend/          # Express API server
│   ├── src/
│   │   ├── controllers/  # Request handlers
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── db/          # Database connections and migrations
│   │   └── middleware/  # Express middleware
├── frontend/         # Next.js application
│   ├── app/          # Next.js app router pages
│   ├── components/   # React components
│   └── lib/          # Utilities and API client
├── db/              # Database schemas and seed data
└── ml/              # ML models (to be added)
```

## Features

- ✅ Promotions Planning
- ✅ Calendar View
- ✅ Analytics & Insights
- ✅ Fund Management
- ✅ Admin Panel:
  - Hierarchy Management (Neo4j sync)
  - ML Model Configuration
- ✅ Semantic Layer (DuckDB)
- ✅ Fast Materialized Views

## Next Steps

1. Set up ML service for volume estimation
2. Configure hierarchy relationships in Admin panel
3. Create your first promotion
4. Set up ML models for volume prediction

