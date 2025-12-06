# Clear and Restart Instructions

This document explains how to clear all DuckDB views/tables and Neo4j graph data, then rebuild everything from scratch.

## Quick Clear Script

Run the cleanup script:

```bash
cd /Users/abhi/Documents/Planning_Console_AI
./scripts/clear-all-data.sh
```

Or manually clear using the API:

```bash
# Clear DuckDB views
curl -s -X POST "http://localhost:3001/api/duckdb/clear-duckdb" -H "Content-Type: application/json"

# Clear Neo4j data
curl -s -X POST "http://localhost:3001/api/duckdb/clear-neo4j" -H "Content-Type: application/json"

# Or clear both at once
curl -s -X POST "http://localhost:3001/api/duckdb/clear-all" -H "Content-Type: application/json"
```

## Manual Clear (if API endpoints don't work)

### Clear DuckDB Views and Tables

```bash
# List all views
curl -s "http://localhost:3001/api/duckdb/query" -H "Content-Type: application/json" \
  -d '{"sql":"SELECT table_name FROM information_schema.tables WHERE table_schema = '\''main'\'' AND table_type = '\''VIEW'\'';"}' | python3 -m json.tool

# Drop each view (replace VIEW_NAME with actual view name)
curl -s -X POST "http://localhost:3001/api/duckdb/query" -H "Content-Type: application/json" \
  -d '{"sql":"DROP VIEW IF EXISTS VIEW_NAME;"}'

# List all tables
curl -s "http://localhost:3001/api/duckdb/query" -H "Content-Type: application/json" \
  -d '{"sql":"SELECT table_name FROM information_schema.tables WHERE table_schema = '\''main'\'' AND table_type = '\''BASE TABLE'\'' AND table_name NOT LIKE '\''sqlite_%'\'';"}' | python3 -m json.tool

# Drop each table (replace TABLE_NAME with actual table name)
curl -s -X POST "http://localhost:3001/api/duckdb/query" -H "Content-Type: application/json" \
  -d '{"sql":"DROP TABLE IF EXISTS TABLE_NAME;"}'
```

### Clear Neo4j Graph Data

Access Neo4j Browser at http://localhost:7474 and run:

```cypher
MATCH ()-[r]->()
DELETE r;

MATCH (n)
DELETE n;
```

Or use cypher-shell:

```bash
docker exec -it planning_console_neo4j cypher-shell -u neo4j -p planning_console_neo4j_2024 -d pc-neo4j-poc
```

Then run:
```cypher
MATCH ()-[r]->() DELETE r;
MATCH (n) DELETE n;
```

## Rebuild Process

After clearing, rebuild in this order:

### Step 1: Build Graph Database

1. Go to **Admin > Setup > Hierarchy Management**
2. Select your tables as nodes
3. Define relationships
4. Click **"Build Graph"**
5. This will:
   - Create nodes and relationships in Neo4j
   - Create rollup views in DuckDB:
     - `customer_rollup`
     - `category_rollup`
     - `brand_rollup`
     - `region_rollup`
     - And materialized tables: `product_m`, `time_m`, etc.

### Step 2: Create Fact Table Views

After the graph is built, create the fact table views:

```bash
curl -s -X POST "http://localhost:3001/api/duckdb/create-fact-views" -H "Content-Type: application/json" | python3 -m json.tool
```

This will create:
- `Prices_allcombo_view` - Prices with customer rollup and drilldown
- `Costs_allcombo_view` - Costs with customer rollup and drilldown

## Verify Everything is Cleared

```bash
# Check DuckDB views (should be empty)
curl -s "http://localhost:3001/api/duckdb/query" -H "Content-Type: application/json" \
  -d '{"sql":"SELECT table_name FROM information_schema.tables WHERE table_schema = '\''main'\'' AND table_type = '\''VIEW'\'';"}' | python3 -m json.tool

# Check DuckDB tables (should be empty)
curl -s "http://localhost:3001/api/duckdb/query" -H "Content-Type: application/json" \
  -d '{"sql":"SELECT table_name FROM information_schema.tables WHERE table_schema = '\''main'\'' AND table_type = '\''BASE TABLE'\'' AND table_name NOT LIKE '\''sqlite_%'\'';"}' | python3 -m json.tool

# Check Neo4j (should return 0)
# Access Neo4j Browser and run: MATCH (n) RETURN count(n) as node_count;
```

## Restart Services (if needed)

If you need to restart everything:

```bash
# Stop services
pkill -f "npm run dev"
pkill -f "next dev"
pkill -f "tsx.*backend"

# Stop databases
docker-compose down

# Start databases
docker-compose up -d

# Wait 10-15 seconds for databases to be ready

# Start backend (in one terminal)
cd backend && npm run dev

# Start frontend (in another terminal)
cd frontend && npm run dev
```

## Notes

- The `duckdb.ts` file was accidentally overwritten and needs to be restored. The cleanup functions are in `neo4j.ts` and the controller endpoints are set up.
- If the API endpoints don't work, you may need to restart the backend server to load the new routes.
- The script `scripts/clear-all-data.sh` provides a convenient way to clear everything.

