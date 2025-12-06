# Manual DuckDB Testing Guide

## Issue: Database Lock

DuckDB doesn't allow multiple processes to access the same database file simultaneously. The backend server holds a lock on the database file, so you can't open it directly with the DuckDB CLI while the server is running.

## Solutions

### Option 1: Stop Backend Temporarily (Recommended for Testing)

```bash
# Stop the backend server
cd /Users/abhi/Documents/Planning_Console_AI
pkill -f "tsx.*backend"

# Wait a few seconds for the lock to release
sleep 3

# Now you can use DuckDB CLI
cd backend
duckdb duckdb/planning_console.duckdb
```

Then run your SQL queries:
```sql
-- List tables
SHOW TABLES;

-- Query category data
SELECT * FROM category_h_view;

-- Count categories
SELECT COUNT(*) FROM category_h_view;

-- Exit DuckDB
.exit
```

After testing, restart the backend:
```bash
cd /Users/abhi/Documents/Planning_Console_AI/backend
npm run dev > /tmp/backend.log 2>&1 &
```

---

### Option 2: Use API Endpoints (While Backend is Running)

While the backend is running, you can test via the API:

#### Test 1: List Tables
```bash
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SHOW TABLES"}' | python3 -m json.tool
```

#### Test 2: Query Category Data
```bash
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM category_h_view LIMIT 5"}' | python3 -m json.tool
```

#### Test 3: Count Records
```bash
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT COUNT(*) as total FROM category_h_view"}' | python3 -m json.tool
```

#### Test 4: Filter Query
```bash
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT category_id, category_name FROM category_h_view WHERE parent_category_id IS NULL"}' | python3 -m json.tool
```

---

### Option 3: Create a Read-Only Copy (For Testing)

Create a copy of the database for read-only testing:

```bash
cd /Users/abhi/Documents/Planning_Console_AI/backend

# Copy the database file
cp duckdb/planning_console.duckdb duckdb/planning_console_readonly.duckdb

# Open the copy (read-only)
duckdb duckdb/planning_console_readonly.duckdb
```

**Note:** This copy won't have the latest data, but it's safe for testing queries.

---

### Option 4: Use Node.js Script (While Backend is Running)

Create a test script that uses a separate DuckDB connection:

```bash
cd /Users/abhi/Documents/Planning_Console_AI/backend
cat > test_duckdb.js << 'EOF'
const { Database } = require('duckdb');
const path = require('path');

// Try to open in read-only mode or create a connection
const dbPath = path.join(__dirname, 'duckdb', 'planning_console.duckdb');

// This will fail if backend has lock, but worth trying
try {
  const db = new Database(dbPath, { access_mode: 'READ_ONLY' });
  const conn = db.connect();
  
  conn.all('SELECT * FROM category_h_view LIMIT 5', (err, rows) => {
    if (err) {
      console.error('Error:', err.message);
      console.log('\n⚠️  Database is locked by backend server.');
      console.log('💡 Solution: Stop backend temporarily or use API endpoints.');
    } else {
      console.log('✅ Query successful!');
      console.log(JSON.stringify(rows, null, 2));
    }
    conn.close();
    db.close();
  });
} catch (error) {
  console.error('Failed to open database:', error.message);
  console.log('\n💡 Use API endpoints instead while backend is running.');
}
EOF

node test_duckdb.js
```

---

## Recommended Testing Workflow

### Step 1: Stop Backend
```bash
cd /Users/abhi/Documents/Planning_Console_AI
pkill -f "tsx.*backend"
sleep 3
```

### Step 2: Open DuckDB CLI
```bash
cd backend
duckdb duckdb/planning_console.duckdb
```

### Step 3: Run Test Queries

```sql
-- 1. Show all tables
SHOW TABLES;

-- 2. Describe a table structure
DESCRIBE category_h_view;

-- 3. Basic SELECT
SELECT * FROM category_h_view;

-- 4. Filter query
SELECT * FROM category_h_view WHERE parent_category_id IS NULL;

-- 5. Aggregation
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN parent_category_id IS NULL THEN 1 END) as root_categories,
  COUNT(CASE WHEN parent_category_id IS NOT NULL THEN 1 END) as child_categories
FROM category_h_view;

-- 6. Order by
SELECT * FROM category_h_view ORDER BY category_id;

-- 7. Limit
SELECT * FROM category_h_view LIMIT 3;

-- 8. Exit
.exit
```

### Step 4: Restart Backend
```bash
cd /Users/abhi/Documents/Planning_Console_AI/backend
npm run dev > /tmp/backend.log 2>&1 &
```

---

## Quick Test Script

Save this as `quick_test.sh`:

```bash
#!/bin/bash

echo "🛑 Stopping backend..."
pkill -f "tsx.*backend"
sleep 3

echo "🦆 Opening DuckDB..."
cd /Users/abhi/Documents/Planning_Console_AI/backend
duckdb duckdb/planning_console.duckdb << 'SQL'
SHOW TABLES;
SELECT * FROM category_h_view LIMIT 5;
.exit
SQL

echo "🚀 Restarting backend..."
cd /Users/abhi/Documents/Planning_Console_AI/backend
npm run dev > /tmp/backend.log 2>&1 &
echo "✅ Backend restarted!"
```

Make it executable and run:
```bash
chmod +x quick_test.sh
./quick_test.sh
```

---

## Alternative: Use In-Memory Database for Testing

If you just want to test DuckDB SQL syntax without accessing the actual data:

```bash
duckdb :memory:
```

Then you can test SQL syntax:
```sql
CREATE TABLE test (id INTEGER, name VARCHAR);
INSERT INTO test VALUES (1, 'Test');
SELECT * FROM test;
.exit
```

---

## Troubleshooting

### Error: "Conflicting lock is held"
- **Solution**: Stop the backend server first
- **Command**: `pkill -f "tsx.*backend"` then wait 3 seconds

### Error: "Database file not found"
- **Solution**: Make sure you're in the `backend` directory
- **Check**: `ls -la duckdb/planning_console.duckdb`

### Error: "Table does not exist"
- **Solution**: Create the view first using the API
- **Command**: `curl -X POST http://localhost:3001/api/duckdb/postgres/view -H "Content-Type: application/json" -d '{"tableName": "category_h", "schema": "public"}'`

---

**Happy Testing!** 🦆

