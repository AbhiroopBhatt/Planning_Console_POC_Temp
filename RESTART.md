# How to Restart the Planning Console AI Application

## Quick Start

To get everything running again, follow these steps in order:

### 1. Start Databases (PostgreSQL & Neo4j)

```bash
cd /Users/abhi/Documents/Planning_Console_AI
docker-compose up -d
```

This will start:
- PostgreSQL on port 5432
- Neo4j on ports 7474 (HTTP) and 7687 (Bolt)

Wait about 10-15 seconds for databases to be ready.

### 2. Verify Databases are Running

```bash
docker ps
```

You should see:
- `planning_console_postgres` (healthy)
- `planning_console_neo4j` (healthy)

### 3. Start Backend Server

```bash
cd /Users/abhi/Documents/Planning_Console_AI/backend
npm run dev
```

The backend will run on `http://localhost:3001`

**Note:** The backend logs will be written to `/tmp/backend.log`

### 4. Start Frontend Server

Open a **new terminal window** and run:

```bash
cd /Users/abhi/Documents/Planning_Console_AI/frontend
npm run dev
```

The frontend will run on `http://localhost:3000`

### 5. Access the Application

Open your browser and go to:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Neo4j Browser:** http://localhost:7474 (username: `neo4j`, password: `planning_console_neo4j_2024`)

---

## Database Access Information

### PostgreSQL
- **Host:** localhost (or 127.0.0.1)
- **Port:** 5432
- **Database:** `pc_postgres_db`
- **User:** postgres
- **Password:** postgres

### Neo4j
- **URI:** bolt://127.0.0.1:7687
- **HTTP:** http://localhost:7474
- **Database:** `pc-neo4j-poc`
- **User:** neo4j
- **Password:** planning_console_neo4j_2024

### DuckDB
- **Location:** `duckdb/planning_console.duckdb` (in project root)
- **Access:** Via backend API endpoints under `/api/duckdb`
- **Note:** DuckDB is an in-process analytical database that connects to PostgreSQL and Neo4j

---

## Troubleshooting

### If databases don't start:
```bash
docker-compose down
docker-compose up -d
```

### If backend fails to connect:
- Check that PostgreSQL is running: `docker ps | grep postgres`
- Check backend logs: `tail -f /tmp/backend.log`
- Verify `.env` file in `backend/` directory has correct credentials

### If frontend can't connect to backend:
- Verify backend is running on port 3001
- Check CORS settings in `backend/src/index.ts`
- Check browser console for errors

### If frontend styling is missing:
- Clear Next.js cache: `cd frontend && rm -rf .next`
- Restart frontend server

### To view backend logs:
```bash
tail -f /tmp/backend.log
```

### To view frontend logs:
```bash
tail -f /tmp/frontend.log
```

### To stop everything:
```bash
# Stop backend and frontend
pkill -f "npm run dev"
pkill -f "next dev"
pkill -f "tsx.*backend"

# Stop databases
docker-compose down
```

---

## Current State

Your application is currently set up with:

✅ **PostgreSQL Database (`pc_postgres_db`):**
- Schema created and migrated
- Seed data loaded from CSV files
- Tables: Category_H, Brand_H, Product_M, Customer_H, Region_H, Fact_*, etc.
- `hierarchy_relationships` table with relationship configurations

✅ **Neo4j Graph Database (`pc-neo4j-poc`):**
- Database created and configured
- Ready to store graph nodes and relationships
- Authentication configured

✅ **DuckDB Analytical Database:**
- Database file created at `duckdb/planning_console.duckdb`
- Connected to PostgreSQL and Neo4j
- Rollup views for Category, Brand, Region, and Customer hierarchies
- Materialized views for fact tables (fact_prices, fact_costs) with customer rollup
- **Note:** Rollup views are created when you build the graph in Hierarchy Management

✅ **Backend API:**
- Running on port 3001
- Endpoints for:
  - Hierarchy management (`/api/hierarchy`)
  - Data management (`/api/data-management`)
  - Fact data management (`/api/fact-data`)
  - DuckDB operations (`/api/duckdb`)
  - ML configuration (`/api/ml-config`)
- Connected to PostgreSQL, Neo4j, and DuckDB

✅ **Frontend:**
- Running on port 3000
- Admin panel with:
  - **Setup and Maintenance:**
    - **Hierarchy Management:** Select tables as nodes, define relationships, build graph to Neo4j
    - **Data Management:**
      - **Tables Tab:** View PostgreSQL tables and data
      - **Fact Data Management Tab:**
        - **Prices Report:** View prices with Category, Brand, Customer, Product, and Date filters
        - **Costs Report:** View costs with Category, Brand, Customer, Product, and Date filters
      - **DuckDB Views Tab:** View DuckDB tables/views and their data, create/refresh fact table views

---

## Quick Commands Reference

```bash
# Start everything
docker-compose up -d
cd backend && npm run dev > /tmp/backend.log 2>&1 &  # Run in background
cd frontend && npm run dev > /tmp/frontend.log 2>&1 &  # Run in background

# Or run in separate terminals:
cd backend && npm run dev
cd frontend && npm run dev

# Stop everything
pkill -f "npm run dev"
pkill -f "next dev"
pkill -f "tsx.*backend"
docker-compose down

# Check status
docker ps                    # Check containers
curl http://localhost:3001/api/health  # Check backend
curl http://localhost:3000   # Check frontend
```

---

## Next Steps After Restart

1. **Verify Hierarchy Management:**
   - Go to Admin > Setup and Maintenance > Hierarchy Management
   - Select tables as nodes
   - Define relationships
   - Click "Build Graph" to import to Neo4j
   - **Important:** Building the graph also creates DuckDB rollup views (Category, Brand, Region, Customer)

2. **Check Neo4j Graph:**
   - Open Neo4j Browser at http://localhost:7474
   - Run: `MATCH (n) RETURN n LIMIT 25`
   - Run: `MATCH ()-[r]->() RETURN r LIMIT 25`

3. **View Data:**
   - Go to Admin > Setup and Maintenance > Data Management
   - Browse PostgreSQL tables and data in the "Tables" tab

4. **Use Fact Data Reports:**
   - Go to Admin > Setup and Maintenance > Data Management > Fact Data Management
   - Access Prices Report and Costs Report with hierarchical filters

5. **Use DuckDB Views:**
   - Go to Admin > Setup and Maintenance > Data Management > DuckDB Views
   - View rollup views and fact table views
   - **Note:** To create/refresh fact table views, you must first build the graph in Hierarchy Management (to create customer_rollup)

---

## Important Notes

### DuckDB Rollup Views
- Rollup views (Category, Brand, Region, Customer) are automatically created when you build the graph in Hierarchy Management
- These views contain parent-child relationships from Neo4j, including self-referencing rows (each parent has itself as a child)

### DuckDB Fact Table Views
- Fact table views require the `customer_rollup` view to exist first
- To create fact table views:
  1. Build the graph in Hierarchy Management (creates rollup views)
  2. Go to Data Management > DuckDB Views
  3. Click "Create/Refresh Fact Views" button
- This creates views:
  - `fact_prices_rollup` - Prices with customer rollup
  - `fact_costs_rollup` - Costs with customer rollup
  - `fact_prices_all_combinations` - All customer-product-time combinations for prices
  - `fact_costs_all_combinations` - All customer-product-time combinations for costs

### Known Issues & Fixes
- **PostgreSQL Connection:** If you see "role postgres does not exist", the backend uses Docker exec as fallback
- **DuckDB Type Issues:** Large integers (like barcodes) are now handled as BIGINT
- **Frontend Styling:** If styling is missing, clear `.next` cache and restart

---

**Last Updated:** 2025-12-03
**Status:** All services configured and ready to run. DuckDB integration complete with rollup views and fact table materialized views.
