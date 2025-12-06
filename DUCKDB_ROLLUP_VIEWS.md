# DuckDB Rollup Views

## Overview

DuckDB rollup views are automatically created and refreshed when the Neo4j graph is built from Hierarchy Management. These views maintain parent-child relationships for all hierarchies, including transitive relationships (all descendants) and self-references (each parent includes itself as a child).

## Rollup Views

The following rollup views are created in DuckDB:

1. **category_rollup** - Category hierarchy rollup
2. **brand_rollup** - Brand hierarchy rollup
3. **region_rollup** - Region hierarchy rollup
4. **customer_rollup** - Customer hierarchy rollup

## View Structure

Each rollup view has the following structure:

```sql
CREATE TABLE <hierarchy>_rollup (
  parent_id INTEGER,
  child_id INTEGER
);
```

### Data Included

Each rollup view includes:
- **Direct relationships**: All direct parent-child relationships from Neo4j
- **Transitive relationships**: All descendants of a parent (children, grandchildren, etc.)
- **Self-references**: Each node is included as a child of itself (for easier querying)

## Usage Examples

### Query all children of a category (including descendants)

```sql
SELECT child_id 
FROM category_rollup 
WHERE parent_id = 1;
```

This will return:
- Category 1 itself (self-reference)
- All direct children of category 1
- All grandchildren, great-grandchildren, etc. of category 1

### Query all parents of a customer (including ancestors)

```sql
SELECT parent_id 
FROM customer_rollup 
WHERE child_id = 5;
```

### Join with fact tables for rollup aggregations

```sql
-- Get all sales for a category and all its children
SELECT 
  SUM(fp.customer_price) as total_revenue
FROM fact_prices fp
INNER JOIN product_m p ON fp.product_id = p.product_id
INNER JOIN category_rollup cr ON p.category_id = cr.child_id
WHERE cr.parent_id = 1;  -- Category 1 and all its children
```

### Count distinct customers in a hierarchy

```sql
SELECT COUNT(DISTINCT child_id) as customer_count
FROM customer_rollup
WHERE parent_id = 10;  -- Customer 10 and all its children
```

## Automatic Refresh

Rollup views are automatically refreshed when:
- The "Build Graph" button is clicked in Hierarchy Management
- The graph build process completes successfully

The refresh happens in Step 4 of the graph build process, after all nodes and relationships have been created in Neo4j.

## Manual Refresh

If you need to manually refresh the rollup views, you can use the DuckDB API:

```bash
# Refresh all rollup views
curl -X POST http://localhost:3001/api/duckdb/refresh-rollup-views
```

Or use the DuckDB controller directly:

```typescript
import { refreshAllRollupViews } from './db/duckdb';
await refreshAllRollupViews();
```

## Neo4j Configuration

The rollup views read from Neo4j using the following configuration:

| Hierarchy | Node Label | Relationship Type | ID Property |
|-----------|-----------|------------------|-------------|
| Category  | `category_h` | `Has_Parent_Cat` | `category_id` |
| Brand     | `brand_h` | `Has_Parent_Brand` | `brand_id` |
| Region    | `region_h` | `Has_Parent_Reg` | `region_id` |
| Customer  | `customer_h` | `Has_Parent_Cust` | `customer_id` |

## Notes

- Rollup views are stored as tables in DuckDB (not true views) for better performance
- The views are completely refreshed on each build (drop and recreate)
- If a hierarchy has no data in Neo4j, an empty table structure is created
- Duplicate relationships are automatically removed
- The refresh process logs any errors but does not fail the entire graph build if rollup views fail

## Troubleshooting

### Views not created

1. Check that DuckDB is available: `curl http://localhost:3001/api/duckdb/status`
2. Check the build graph log file for rollup view errors
3. Verify that nodes and relationships exist in Neo4j for the hierarchy

### Views empty

1. Verify that the hierarchy has been built in Neo4j
2. Check that the node labels and relationship types match the configuration
3. Query Neo4j directly to verify relationships exist

### Performance

- Rollup views are materialized tables, so queries are fast
- For very large hierarchies, the refresh process may take a few seconds
- Consider indexing if you frequently query by parent_id or child_id

