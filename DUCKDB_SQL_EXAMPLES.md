# DuckDB SQL Examples for Manual Testing

This document provides SQL examples you can use to test DuckDB manually via the terminal or API.

## Prerequisites

1. **DuckDB CLI Installation** (Optional - for direct terminal access):
   ```bash
   # On macOS
   brew install duckdb
   
   # Or download from: https://duckdb.org/docs/installation/
   ```

2. **Access DuckDB Database**:
   - Database file: `backend/duckdb/planning_console.duckdb`
   - Via API: `POST http://localhost:3001/api/duckdb/query`

---

## Method 1: Using DuckDB CLI (Terminal)

### Connect to Database
```bash
cd /Users/abhi/Documents/Planning_Console_AI/backend
duckdb duckdb/planning_console.duckdb
```

### Basic Queries

#### 1. List All Tables
```sql
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'main'
ORDER BY table_name;
```

#### 2. View Table Structure
```sql
-- Get columns for a specific table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'main' AND table_name = 'category_h_view'
ORDER BY ordinal_position;
```

#### 3. Query Category Data
```sql
-- Select all categories
SELECT * FROM category_h_view;

-- Select top-level categories (no parent)
SELECT category_id, category_name, parent_category_id
FROM category_h_view
WHERE parent_category_id IS NULL;

-- Select child categories
SELECT category_id, category_name, parent_category_id
FROM category_h_view
WHERE parent_category_id IS NOT NULL
ORDER BY parent_category_id, category_id;
```

---

## Method 2: Using Node.js (Terminal)

### Interactive DuckDB Session
```bash
cd /Users/abhi/Documents/Planning_Console_AI/backend
node
```

Then in Node.js:
```javascript
const { Database } = require('duckdb');
const db = new Database('./duckdb/planning_console.duckdb');

// Query example
db.all('SELECT * FROM category_h_view LIMIT 5', (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});
```

---

## Method 3: Using cURL (API)

### Basic Query
```bash
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM category_h_view LIMIT 5"}' | python3 -m json.tool
```

### List Tables
```bash
curl -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT table_name FROM information_schema.tables WHERE table_schema = '\''main'\'' ORDER BY table_name"}' | python3 -m json.tool
```

---

## SQL Examples for Testing

### 1. Basic SELECT Queries

```sql
-- Select all columns from category view
SELECT * FROM category_h_view;

-- Select specific columns
SELECT category_id, category_name FROM category_h_view;

-- Select with WHERE clause
SELECT * FROM category_h_view WHERE category_id > 2;

-- Select with LIMIT
SELECT * FROM category_h_view LIMIT 10;
```

### 2. Aggregations

```sql
-- Count total categories
SELECT COUNT(*) as total_categories FROM category_h_view;

-- Count categories by parent
SELECT 
  parent_category_id,
  COUNT(*) as child_count
FROM category_h_view
WHERE parent_category_id IS NOT NULL
GROUP BY parent_category_id
ORDER BY child_count DESC;

-- Count top-level vs child categories
SELECT 
  CASE 
    WHEN parent_category_id IS NULL THEN 'Top Level'
    ELSE 'Child'
  END as category_type,
  COUNT(*) as count
FROM category_h_view
GROUP BY category_type;
```

### 3. Joins (when you have multiple tables)

```sql
-- Example: Join categories with products (if product_m_view exists)
-- First create the product view:
-- POST /api/duckdb/postgres/view with {"tableName": "product_m", "schema": "public"}

-- Then join:
SELECT 
  c.category_name,
  COUNT(p.product_id) as product_count
FROM category_h_view c
LEFT JOIN product_m_view p ON c.category_id = p.category_id
GROUP BY c.category_name
ORDER BY product_count DESC;
```

### 4. Window Functions

```sql
-- Rank categories by ID
SELECT 
  category_id,
  category_name,
  ROW_NUMBER() OVER (ORDER BY category_id) as row_num
FROM category_h_view;

-- Running total
SELECT 
  category_id,
  category_name,
  SUM(category_id) OVER (ORDER BY category_id) as running_total
FROM category_h_view;
```

### 5. Subqueries

```sql
-- Categories with most children
SELECT 
  parent_category_id,
  (SELECT category_name FROM category_h_view WHERE category_id = c.parent_category_id) as parent_name,
  COUNT(*) as child_count
FROM category_h_view c
WHERE parent_category_id IS NOT NULL
GROUP BY parent_category_id
ORDER BY child_count DESC;
```

### 6. Creating Materialized Views/Tables

```sql
-- Create a summary table
CREATE TABLE category_summary AS
SELECT 
  CASE 
    WHEN parent_category_id IS NULL THEN 'Root'
    ELSE 'Child'
  END as category_level,
  COUNT(*) as count
FROM category_h_view
GROUP BY category_level;

-- Query the summary
SELECT * FROM category_summary;
```

### 7. Working with Multiple PostgreSQL Tables

```sql
-- First, create views for other tables:
-- POST /api/duckdb/postgres/view {"tableName": "brand_h", "schema": "public"}
-- POST /api/duckdb/postgres/view {"tableName": "product_m", "schema": "public"}
-- POST /api/duckdb/postgres/view {"tableName": "region_h", "schema": "public"}

-- Then you can join them:
SELECT 
  c.category_name,
  b.brand_name,
  COUNT(p.product_id) as product_count
FROM category_h_view c
CROSS JOIN brand_h_view b
LEFT JOIN product_m_view p 
  ON p.category_id = c.category_id 
  AND p.brand_id = b.brand_id
GROUP BY c.category_name, b.brand_name
ORDER BY product_count DESC;
```

### 8. Analytical Queries

```sql
-- Category hierarchy depth (if you have parent relationships)
WITH RECURSIVE category_tree AS (
  -- Root categories
  SELECT 
    category_id,
    category_name,
    parent_category_id,
    0 as depth
  FROM category_h_view
  WHERE parent_category_id IS NULL
  
  UNION ALL
  
  -- Child categories
  SELECT 
    c.category_id,
    c.category_name,
    c.parent_category_id,
    ct.depth + 1
  FROM category_h_view c
  JOIN category_tree ct ON c.parent_category_id = ct.category_id
)
SELECT * FROM category_tree ORDER BY depth, category_id;
```

### 9. Data Type Operations

```sql
-- String operations
SELECT 
  category_name,
  UPPER(category_name) as upper_name,
  LENGTH(category_name) as name_length
FROM category_h_view;

-- Numeric operations
SELECT 
  category_id,
  category_id * 2 as doubled_id,
  SQRT(category_id) as sqrt_id
FROM category_h_view;
```

### 10. Filtering and Sorting

```sql
-- Filter with multiple conditions
SELECT * FROM category_h_view
WHERE category_id > 2 AND parent_category_id IS NOT NULL
ORDER BY parent_category_id, category_id;

-- Sort by multiple columns
SELECT * FROM category_h_view
ORDER BY parent_category_id NULLS FIRST, category_id;
```

---

## Quick Test Script

Save this as `test_duckdb.sh`:

```bash
#!/bin/bash

# Test DuckDB connection and queries
echo "=== Testing DuckDB ==="
echo ""

echo "1. Listing tables..."
curl -s -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT table_name FROM information_schema.tables WHERE table_schema = '\''main'\'' ORDER BY table_name"}' | python3 -m json.tool

echo ""
echo "2. Querying category_h_view..."
curl -s -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM category_h_view LIMIT 5"}' | python3 -m json.tool

echo ""
echo "3. Counting categories..."
curl -s -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT COUNT(*) as total FROM category_h_view"}' | python3 -m json.tool

echo ""
echo "4. Top-level categories..."
curl -s -X POST http://localhost:3001/api/duckdb/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT category_id, category_name FROM category_h_view WHERE parent_category_id IS NULL"}' | python3 -m json.tool
```

Make it executable and run:
```bash
chmod +x test_duckdb.sh
./test_duckdb.sh
```

---

## Creating More Views from PostgreSQL

Before you can query other tables, create views for them:

```bash
# Create view for product_m table
curl -X POST http://localhost:3001/api/duckdb/postgres/view \
  -H "Content-Type: application/json" \
  -d '{"tableName": "product_m", "schema": "public"}'

# Create view for brand_h table
curl -X POST http://localhost:3001/api/duckdb/postgres/view \
  -H "Content-Type: application/json" \
  -d '{"tableName": "brand_h", "schema": "public"}'

# Create view for region_h table
curl -X POST http://localhost:3001/api/duckdb/postgres/view \
  -H "Content-Type: application/json" \
  -d '{"tableName": "region_h", "schema": "public"}'

# Create view for customer_h table
curl -X POST http://localhost:3001/api/duckdb/postgres/view \
  -H "Content-Type: application/json" \
  -d '{"tableName": "customer_h", "schema": "public"}'
```

---

## Performance Tips

1. **Use LIMIT** for testing:
   ```sql
   SELECT * FROM category_h_view LIMIT 10;
   ```

2. **Create materialized tables** for frequently accessed data:
   ```sql
   CREATE TABLE category_summary AS
   SELECT parent_category_id, COUNT(*) as count
   FROM category_h_view
   GROUP BY parent_category_id;
   ```

3. **Use indexes** (DuckDB automatically creates them, but you can verify):
   ```sql
   SHOW TABLES;
   ```

---

## Troubleshooting

### Error: "Table does not exist"
- Make sure you've created the view first using the API
- Check table name spelling (case-sensitive)

### Error: "Connection Error"
- Ensure backend server is running
- Check database file exists at `backend/duckdb/planning_console.duckdb`

### Error: "Parameter mismatch"
- Don't use parameterized queries in SQL strings
- Use direct SQL without `$1`, `$2` placeholders

---

**Happy Querying!** 🦆

