#!/bin/bash

# Script to clear all DuckDB views/tables and Neo4j graph data
# Usage: ./scripts/clear-all-data.sh

echo "=========================================="
echo "Clearing All DuckDB and Neo4j Data"
echo "=========================================="
echo ""

# Get all DuckDB views and drop them
echo "Step 1: Dropping all DuckDB views..."
VIEWS=$(curl -s "http://localhost:3001/api/duckdb/query" -H "Content-Type: application/json" -d '{"sql":"SELECT table_name FROM information_schema.tables WHERE table_schema = '\''main'\'' AND table_type = '\''VIEW'\'';"}' | python3 -c "import sys, json; data = json.load(sys.stdin); print('\n'.join([v['table_name'] for v in data.get('data', [])]))")

if [ -z "$VIEWS" ]; then
  echo "  No views found"
else
  echo "$VIEWS" | while read view; do
    if [ ! -z "$view" ]; then
      echo "  Dropping view: $view"
      curl -s -X POST "http://localhost:3001/api/duckdb/query" -H "Content-Type: application/json" -d "{\"sql\":\"DROP VIEW IF EXISTS $view;\"}" > /dev/null
    fi
  done
fi

echo ""

# Get all DuckDB tables and drop them
echo "Step 2: Dropping all DuckDB tables..."
TABLES=$(curl -s "http://localhost:3001/api/duckdb/query" -H "Content-Type: application/json" -d '{"sql":"SELECT table_name FROM information_schema.tables WHERE table_schema = '\''main'\'' AND table_type = '\''BASE TABLE'\'' AND table_name NOT LIKE '\''sqlite_%'\'';"}' | python3 -c "import sys, json; data = json.load(sys.stdin); print('\n'.join([t['table_name'] for t in data.get('data', [])]))")

if [ -z "$TABLES" ]; then
  echo "  No tables found"
else
  echo "$TABLES" | while read table; do
    if [ ! -z "$table" ]; then
      echo "  Dropping table: $table"
      curl -s -X POST "http://localhost:3001/api/duckdb/query" -H "Content-Type: application/json" -d "{\"sql\":\"DROP TABLE IF EXISTS $table;\"}" > /dev/null
    fi
  done
fi

echo ""

# Clear Neo4j data using direct cypher-shell
echo "Step 3: Clearing all Neo4j nodes and relationships..."
docker exec -i planning_console_neo4j cypher-shell -u neo4j -p planning_console_neo4j_2024 -d pc-neo4j-poc << 'CYPHER' 2>/dev/null
MATCH ()-[r]->()
DELETE r;
MATCH (n)
DELETE n;
RETURN 'All nodes and relationships deleted' as result;
CYPHER
echo "  Neo4j cleared!"

echo ""
echo "=========================================="
echo "Cleanup Complete!"
echo "=========================================="
echo ""
echo "Verification:"
echo "  DuckDB Views: $(curl -s 'http://localhost:3001/api/duckdb/query' -H 'Content-Type: application/json' -d '{"sql":"SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = '\''main'\'' AND table_type = '\''VIEW'\'';"}' | python3 -c 'import sys, json; print(json.load(sys.stdin).get("data", [{}])[0].get("cnt", 0))')"
echo "  DuckDB Tables: $(curl -s 'http://localhost:3001/api/duckdb/query' -H 'Content-Type: application/json' -d '{"sql":"SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = '\''main'\'' AND table_type = '\''BASE TABLE'\'' AND table_name NOT LIKE '\''sqlite_%'\'';"}' | python3 -c 'import sys, json; print(json.load(sys.stdin).get("data", [{}])[0].get("cnt", 0))')"
echo "  Neo4j Nodes: $(docker exec planning_console_neo4j cypher-shell -u neo4j -p planning_console_neo4j_2024 -d pc-neo4j-poc 'MATCH (n) RETURN count(n) as cnt;' 2>/dev/null | grep -o '[0-9]*' | head -1 || echo '0')"
echo ""
echo "Next steps:"
echo "1. Build the graph in Hierarchy Management (Admin > Setup > Hierarchy Management)"
echo "   This will create rollup views in DuckDB (customer_rollup, category_rollup, etc.)"
echo ""
echo "2. Create fact table views:"
echo "   curl -X POST http://localhost:3001/api/duckdb/create-fact-views -H 'Content-Type: application/json'"
echo "   This will create Prices_allcombo_view and Costs_allcombo_view"
echo ""
