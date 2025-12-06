# DuckDB Integration Documentation

## Overview

DuckDB is an in-process analytical database that has been integrated into the Planning Console AI application to provide:
- **Fast Analytics**: High-performance analytical queries on top of PostgreSQL data
- **Rollup Views**: Materialized views for faster aggregations
- **Graph Data Integration**: Import and analyze data from Neo4j graph database
- **Unified Analytics Layer**: Single query interface for both relational and graph data

---

## Database Information

### Location
- **Database File**: `backend/duckdb/planning_console.duckdb`
- **Storage**: File-based database (persistent storage)
- **Type**: In-process analytical database

### Database Details
- **Database Name**: `planning_console`
- **Default Schema**: `main`
- **File Format**: DuckDB native format (`.duckdb`)

### Access Information
- **Access Method**: Programmatic via Node.js DuckDB driver
- **Connection**: In-process (no separate server required)
- **Port**: N/A (in-process database)

---

## Installation & Setup

### Prerequisites
- Node.js installed
- PostgreSQL running (for data source)
- Neo4j running (for graph data import)

### Installation
DuckDB is installed as an optional dependency in the backend:

```bash
cd backend
npm install duckdb
```

If installation fails, try:
```bash
npm install duckdb --build-from-source
```

### Initialization
DuckDB is automatically initialized when the backend server starts. The database file is created at:
```
backend/duckdb/planning_console.duckdb
```

---

## Connection Modules

### 1. PostgreSQL Connection

DuckDB can connect to PostgreSQL using the `postgres` extension to:
- Query PostgreSQL tables directly (via views)
- Copy data from PostgreSQL into DuckDB (via tables)

#### Connection Details
- **Host**: `127.0.0.1` (configurable via `POSTGRES_HOST`)
- **Port**: `5432` (configurable via `POSTGRES_PORT`)
- **Database**: `pc_postgres_db`
- **User**: `postgres` (configurable via `POSTGRES_USER`)
- **Password**: `postgres` (configurable via `POSTGRES_PASSWORD`)

#### Connection String Format
```
postgresql://postgres:postgres@127.0.0.1:5432/pc_postgres_db
```

#### Extension Setup
The PostgreSQL extension is automatically installed and loaded on startup:
```sql
INSTALL postgres;
LOAD postgres;
```

### 2. Neo4j Connection

DuckDB imports data from Neo4j through the backend API:
- Data is exported from Neo4j using Cypher queries
- Imported into DuckDB tables for analytical queries

#### Connection Details
- **URI**: `bolt://127.0.0.1:7687` (configurable via `NEO4J_URI`)
- **User**: `neo4j` (configurable via `NEO4J_USER`)
- **Password**: `planning_console_neo4j_2024` (configurable via `NEO4J_PASSWORD`)
- **Database**: `pc-neo4j-poc` (configurable via `NEO4J_DATABASE`)

---

## API Endpoints

All DuckDB endpoints are prefixed with `/api/duckdb`

### Status & Health

#### Get DuckDB Status
```http
GET /api/duckdb/status
```

**Response:**
```json
{
  "success": true,
  "available": true,
  "connections": {
    "postgres": {
      "connected": true,
      "host": "127.0.0.1",
      "port": "5432",
      "database": "pc_postgres_db"
    },
    "neo4j": {
      "connected": true,
      "uri": "bolt://127.0.0.1:7687",
      "database": "pc-neo4j-poc"
    }
  },
  "message": "DuckDB is available and ready"
}
```

#### Test PostgreSQL Connection
```http
GET /api/duckdb/test/postgres
```

**Response:**
```json
{
  "success": true,
  "message": "PostgreSQL connection successful"
}
```

#### Test Neo4j Connection
```http
GET /api/duckdb/test/neo4j
```

**Response:**
```json
{
  "success": true,
  "message": "Neo4j connection successful"
}
```

### Table Management

#### List All Tables
```http
GET /api/duckdb/tables
```

**Response:**
```json
{
  "success": true,
  "tables": [
    {
      "name": "category_h_view",
      "type": "VIEW"
    },
    {
      "name": "product_m",
      "type": "BASE TABLE"
    }
  ]
}
```

### PostgreSQL Integration

#### Create View from PostgreSQL Table
Creates a view that queries PostgreSQL directly (no data copy, always fresh).

```http
POST /api/duckdb/postgres/view
Content-Type: application/json

{
  "tableName": "category_h",
  "schema": "public",
  "viewName": "category_h_view"  // Optional, defaults to {tableName}_view
}
```

**Response:**
```json
{
  "success": true,
  "message": "View created successfully: category_h_view",
  "viewName": "category_h_view",
  "sourceTable": "public.category_h"
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/duckdb/postgres/view \
  -H "Content-Type: application/json" \
  -d '{
    "tableName": "category_h",
    "schema": "public"
  }'
```

#### Create Table from PostgreSQL (Copy Data)
Creates a table in DuckDB by copying data from PostgreSQL (materialized, faster queries).

```http
POST /api/duckdb/postgres/table
Content-Type: application/json

{
  "tableName": "product_m",
  "schema": "public",
  "duckdbTableName": "product_m"  // Optional, defaults to tableName
}
```

**Response:**
```json
{
  "success": true,
  "message": "Remote table created successfully: product_m",
  "duckdbTableName": "product_m",
  "sourceTable": "public.product_m"
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/duckdb/postgres/table \
  -H "Content-Type: application/json" \
  -d '{
    "tableName": "product_m",
    "schema": "public"
  }'
```

### Neo4j Integration

#### Import Data from Neo4j
Imports data from Neo4j into a DuckDB table using a Cypher query.

```http
POST /api/duckdb/neo4j/import
Content-Type: application/json

{
  "cypherQuery": "MATCH (n:category_h) RETURN n.category_id as category_id, n.category_name as category_name",
  "tableName": "neo4j_categories",
  "clearExisting": true  // Optional, defaults to false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Data imported from Neo4j into DuckDB table: neo4j_categories",
  "tableName": "neo4j_categories"
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/duckdb/neo4j/import \
  -H "Content-Type: application/json" \
  -d '{
    "cypherQuery": "MATCH (n:category_h) RETURN n.category_id as category_id, n.category_name as category_name",
    "tableName": "neo4j_categories",
    "clearExisting": true
  }'
```

### Query Execution

#### Execute SQL Query
Execute any SQL query directly in DuckDB.

```http
POST /api/duckdb/query
Content-Type: application/json

{
  "sql": "SELECT * FROM category_h_view LIMIT 10"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "category_id": 1,
      "category_name": "Beverages",
      "parent_category_id": null
    }
  ],
  "rowCount": 1
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT COUNT(*) as total FROM category_h_view"
  }'
```

---

## Usage Examples

### Example 1: Create a Rollup View from PostgreSQL

```bash
# Create a view for category hierarchy
curl -X POST http://localhost:3001/api/duckdb/postgres/view \
  -H "Content-Type: application/json" \
  -d '{
    "tableName": "category_h",
    "schema": "public",
    "viewName": "category_hierarchy"
  }'

# Query the view
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM category_hierarchy WHERE parent_category_id IS NULL"
  }'
```

### Example 2: Create Materialized Table for Fast Analytics

```bash
# Copy product data into DuckDB
curl -X POST http://localhost:3001/api/duckdb/postgres/table \
  -H "Content-Type: application/json" \
  -d '{
    "tableName": "product_m",
    "schema": "public"
  }'

# Run analytical queries (much faster than querying PostgreSQL)
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT category_id, COUNT(*) as product_count FROM product_m GROUP BY category_id"
  }'
```

### Example 3: Import Neo4j Graph Data

```bash
# Import all category nodes from Neo4j
curl -X POST http://localhost:3001/api/duckdb/neo4j/import \
  -H "Content-Type: application/json" \
  -d '{
    "cypherQuery": "MATCH (n:category_h) RETURN n.category_id as id, n.category_name as name, n.parent_category_id as parent_id",
    "tableName": "neo4j_categories"
  }'

# Query the imported data
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM neo4j_categories WHERE parent_id IS NOT NULL"
  }'
```

### Example 4: Create Aggregated Rollup Views

```bash
# Create a view for product aggregations
curl -X POST http://localhost:3001/api/duckdb/postgres/view \
  -H "Content-Type: application/json" \
  -d '{
    "tableName": "product_m",
    "schema": "public",
    "viewName": "product_view"
  }'

# Create a materialized rollup table
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "CREATE TABLE product_rollup AS SELECT category_id, brand_id, COUNT(*) as product_count, AVG(net_weight) as avg_weight FROM product_view GROUP BY category_id, brand_id"
  }'

# Query the rollup
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM product_rollup ORDER BY product_count DESC"
  }'
```

---

## Code Structure

### Database Module
**File**: `backend/src/db/duckdb.ts`

**Key Functions:**
- `query(sql, params)` - Execute SELECT queries
- `run(sql, params)` - Execute DDL/DML commands
- `isAvailable()` - Check if DuckDB is available
- `createPostgresView()` - Create view from PostgreSQL
- `createPostgresRemoteTable()` - Create table from PostgreSQL
- `importNeo4jData()` - Import data from Neo4j
- `testPostgresConnection()` - Test PostgreSQL connection
- `testNeo4jConnection()` - Test Neo4j connection

### Controller
**File**: `backend/src/controllers/duckdbController.ts`

**Key Methods:**
- `getStatus()` - Get DuckDB status and connection info
- `testPostgres()` - Test PostgreSQL connection
- `testNeo4j()` - Test Neo4j connection
- `createPostgresView()` - Create PostgreSQL view
- `createPostgresTable()` - Create PostgreSQL table
- `importNeo4jData()` - Import Neo4j data
- `executeQuery()` - Execute SQL query
- `listTables()` - List all tables

### Routes
**File**: `backend/src/routes/duckdb.ts`

All routes are registered under `/api/duckdb`

---

## Environment Variables

The following environment variables can be configured in `backend/.env`:

```env
# DuckDB Configuration
DUCKDB_PATH=./duckdb/planning_console.duckdb

# PostgreSQL Connection (for DuckDB postgres extension)
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Neo4j Connection (for data import)
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=planning_console_neo4j_2024
NEO4J_DATABASE=pc-neo4j-poc
```

---

## Best Practices

### 1. Views vs Tables
- **Use Views** when you need real-time data from PostgreSQL
- **Use Tables** when you need fast analytical queries (data is copied)

### 2. Refresh Strategy
- Views automatically reflect PostgreSQL changes
- Tables need to be refreshed manually by dropping and recreating

### 3. Performance
- DuckDB excels at analytical queries (aggregations, joins, window functions)
- Use materialized tables for frequently accessed rollups
- Keep views for real-time operational queries

### 4. Data Import
- Import Neo4j data periodically for analytics
- Use `clearExisting: true` to refresh imported data
- Structure Cypher queries to return flat, tabular data

---

## Troubleshooting

### DuckDB Not Available
**Error**: `"DuckDB is not available. Please install DuckDB package."`

**Solution**:
```bash
cd backend
npm install duckdb --build-from-source
```

### PostgreSQL Connection Failed
**Error**: `"PostgreSQL connection failed"`

**Solutions**:
1. Ensure PostgreSQL is running: `docker ps | grep postgres`
2. Check connection details in `.env`
3. Verify postgres extension is installed: The extension is auto-installed on startup

### Neo4j Import Fails
**Error**: `"Failed to import Neo4j data"`

**Solutions**:
1. Verify Neo4j is running: `docker ps | grep neo4j`
2. Check Cypher query syntax
3. Ensure query returns flat tabular data (not graph structures)

### Query Errors
**Error**: `"Invalid Input Error"`

**Solutions**:
1. Check SQL syntax (DuckDB uses standard SQL)
2. Verify table/view names exist
3. Check column names match exactly

---

## Advanced Usage

### Creating Materialized Views

```sql
-- Create a materialized view for category product counts
CREATE TABLE category_product_counts AS
SELECT 
  c.category_id,
  c.category_name,
  COUNT(p.product_id) as product_count
FROM category_h_view c
LEFT JOIN product_m_view p ON c.category_id = p.category_id
GROUP BY c.category_id, c.category_name;
```

### Joining PostgreSQL and Neo4j Data

```sql
-- Import Neo4j relationships
-- Then join with PostgreSQL data
SELECT 
  pg.category_id,
  pg.category_name,
  neo.relationship_count
FROM category_h_view pg
LEFT JOIN neo4j_category_stats neo ON pg.category_id = neo.category_id;
```

### Window Functions for Analytics

```sql
-- Calculate running totals
SELECT 
  category_id,
  product_count,
  SUM(product_count) OVER (ORDER BY category_id) as running_total
FROM category_product_counts;
```

---

## File Locations

- **Database File**: `backend/duckdb/planning_console.duckdb`
- **Database Module**: `backend/src/db/duckdb.ts`
- **Controller**: `backend/src/controllers/duckdbController.ts`
- **Routes**: `backend/src/routes/duckdb.ts`
- **Documentation**: `DUCKDB.md` (this file)

---

## Related Documentation

- **RESTART.md**: How to restart the application
- **SETUP.md**: Initial setup instructions
- **PostgreSQL Schema**: `db/schema.sql`
- **Neo4j Integration**: See Hierarchy Management documentation

---

**Last Updated**: 2025-12-02  
**Status**: DuckDB integrated and operational  
**Version**: DuckDB 1.4.2

