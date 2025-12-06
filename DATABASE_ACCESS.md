# Database Access Information

This document contains all database access credentials and connection details for the Planning Console AI system.

## Neo4j Graph Database

### Database: `pc-neo4j-poc`

**Connection Details:**
- **Database Name:** `pc-neo4j-poc`
- **Neo4j Browser (HTTP):** http://localhost:7474
- **Bolt Protocol:** `bolt://localhost:7687`
- **Username:** `neo4j`
- **Password:** `planning_console_neo4j_2024`
- **Container Name:** `planning_console_neo4j`
- **Docker Image:** `neo4j:5-community`

**Environment Variables (Backend):**
```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=planning_console_neo4j_2024
NEO4J_DATABASE=pc-neo4j-poc
```

**Connection String Example:**
```
bolt://neo4j:planning_console_neo4j_2024@localhost:7687
```

**Status:** 
- ✅ Database created and running
- ✅ Empty (0 nodes, 0 relationships)
- ✅ Ready for hierarchy management through Admin UI

**Network:**
- Connected to Docker network: `planning_console_network`
- Can communicate with PostgreSQL container

---

## PostgreSQL Database

### Database: `pc_postgres_db`

**Connection Details:**
- **Database Name:** `pc_postgres_db`
- **Host:** `127.0.0.1` (or `localhost`)
- **Port:** `5432`
- **Username:** `postgres`
- **Password:** `postgres`
- **Container Name:** `planning_console_postgres`
- **Docker Image:** `postgres:14-alpine`

**Environment Variables (Backend):**
```env
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=pc_postgres_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
```

**Connection String Example:**
```
postgresql://postgres:postgres@127.0.0.1:5432/pc_postgres_db
```

**Status:**
- ✅ Database created and running
- ✅ Contains master data tables (Category_H, Brand_H, Product_M, etc.)
- ✅ Contains fact tables (Fact_Prices, Fact_Costs, Fact_Volumes, etc.)
- ✅ Data seeded from CSV files

**Network:**
- Connected to Docker network: `planning_console_network`
- Can communicate with Neo4j container

---

## Docker Network

**Network Name:** `planning_console_network`
**Driver:** `bridge`

**Containers on Network:**
- `planning_console_postgres` (PostgreSQL)
- `planning_console_neo4j` (Neo4j)

Both databases can communicate with each other using their container names as hostnames:
- PostgreSQL can reach Neo4j at: `planning_console_neo4j:7687`
- Neo4j can reach PostgreSQL at: `planning_console_postgres:5432`

---

## Quick Access Commands

### Neo4j

**Connect via Cypher Shell:**
```bash
docker exec -it planning_console_neo4j cypher-shell -u neo4j -p planning_console_neo4j_2024 -d pc-neo4j-poc
```

**Check database status:**
```bash
docker exec planning_console_neo4j cypher-shell -u neo4j -p planning_console_neo4j_2024 -d pc-neo4j-poc "SHOW DATABASES;"
```

**Count nodes:**
```bash
docker exec planning_console_neo4j cypher-shell -u neo4j -p planning_console_neo4j_2024 -d pc-neo4j-poc "MATCH (n) RETURN count(n);"
```

### PostgreSQL

**Connect via psql:**
```bash
docker exec -it planning_console_postgres psql -U postgres -d pc_postgres_db
```

**List all tables:**
```bash
docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -c "\dt"
```

**Check table row counts:**
```bash
docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -c "SELECT table_name, (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.table_name) as column_count FROM information_schema.tables t WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
```

---

## Security Notes

⚠️ **Important:** These credentials are for development use only. For production:
- Change all default passwords
- Use environment variables or secrets management
- Restrict network access
- Enable SSL/TLS for connections
- Use strong, unique passwords

---

## Last Updated

**Date:** November 29, 2024
**Database Status:** Both databases operational and ready for use

