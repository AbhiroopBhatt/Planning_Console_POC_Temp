#!/bin/bash
# Direct Neo4j cleanup using cypher-shell
echo "Clearing Neo4j graph data..."
docker exec -i planning_console_neo4j cypher-shell -u neo4j -p planning_console_neo4j_2024 -d pc-neo4j-poc << 'CYPHER'
MATCH ()-[r]->()
DELETE r;
MATCH (n)
DELETE n;
RETURN 'All nodes and relationships deleted' as result;
CYPHER
echo "Neo4j cleared!"
