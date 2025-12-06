# DuckDB.ts File Restoration Needed

## Issue
The `backend/src/db/duckdb.ts` file was accidentally overwritten during the cleanup process and now only contains the `clearAllDuckDBViewsAndTables` function. The file needs to be restored with all required exports.

## Required Exports
Based on the controller imports, the file needs to export:

1. `isAvailable` - Function to check if DuckDB is available
2. `testPostgresConnection` - Function to test PostgreSQL connection
3. `testNeo4jConnection` - Function to test Neo4j connection
4. `createPostgresView` - Function to create PostgreSQL views in DuckDB
5. `createPostgresRemoteTable` - Function to create remote PostgreSQL tables
6. `importNeo4jData` - Function to import Neo4j data
7. `query` - Function to execute SQL queries
8. `run` - Function to run SQL statements
9. `getDatabase` - Function to get database instance
10. `refreshAllRollupViews` - Function to refresh rollup views
11. `createFactTableViews` - Function to create fact table views
12. `clearAllDuckDBViewsAndTables` - Already present

## Temporary Workaround
The cleanup script (`scripts/clear-all-data.sh`) uses direct SQL queries via the API, so it works even without the full duckdb.ts file. However, the backend API endpoints that depend on these functions will not work until the file is restored.

## Solution Options

### Option 1: Manual Restoration
If you have a backup or version control history, restore the file from there.

### Option 2: Reconstruct from Usage
The file structure should include:
- DuckDB initialization (Database instance, duckdbAvailable flag)
- Connection setup (PostgreSQL and Neo4j extensions)
- All the exported functions listed above

### Option 3: Use Direct SQL (Current Workaround)
Continue using the direct SQL queries via the `/api/duckdb/query` endpoint for now, which works independently of the missing functions.

## Next Steps
1. Restore the duckdb.ts file with all required exports
2. Restart the backend server
3. Verify all endpoints work correctly

