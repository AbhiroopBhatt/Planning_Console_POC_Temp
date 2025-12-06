#!/bin/bash

# Script to clear all DuckDB views/tables and Neo4j graph data
# Usage: ./scripts/clear-all.sh

echo "Clearing all DuckDB views and tables..."
curl -s -X POST "http://localhost:3001/api/duckdb/clear-duckdb" -H "Content-Type: application/json" | python3 -m json.tool

echo ""
echo "Clearing all Neo4j nodes and relationships..."
curl -s -X POST "http://localhost:3001/api/duckdb/clear-neo4j" -H "Content-Type: application/json" | python3 -m json.tool

echo ""
echo "Done! All DuckDB and Neo4j data has been cleared."
echo ""
echo "Next steps:"
echo "1. Build the graph in Hierarchy Management (creates rollup views in DuckDB)"
echo "2. Create fact table views: POST /api/duckdb/create-fact-views"

