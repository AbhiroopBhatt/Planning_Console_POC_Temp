import { Router } from 'express';
import { duckdbController } from '../controllers/duckdbController';

const router = Router();

// Status and connection testing
router.get('/status', duckdbController.getStatus);
router.get('/test/postgres', duckdbController.testPostgres);
router.get('/test/neo4j', duckdbController.testNeo4j);

// PostgreSQL integration
router.post('/postgres/view', duckdbController.createPostgresView);
router.post('/postgres/table', duckdbController.createPostgresTable);

// Neo4j integration
router.post('/neo4j/import', duckdbController.importNeo4jData);

// Query execution
router.post('/query', duckdbController.executeQuery);

// Fact data reports (from DuckDB views) - using /reports prefix to avoid conflict with /tables/:tableName
router.get('/reports/prices', duckdbController.getPricesReport);
router.get('/reports/costs', duckdbController.getCostsReport);
router.get('/reports/base-volumes', duckdbController.getBaseVolumesReport);

// Table operations
router.get('/tables', duckdbController.listTables);
router.get('/tables/:tableName', duckdbController.getTableData);
router.get('/tables/:tableName/schema', duckdbController.getTableSchema);

// Rollup views
router.post('/refresh-rollup-views', duckdbController.refreshRollupViews);
router.post('/create-fact-views', duckdbController.createFactTableViews);

// Cleanup operations
router.post('/clear-all', duckdbController.clearAll);
router.post('/clear-duckdb', duckdbController.clearAllDuckDB);
router.post('/clear-neo4j', duckdbController.clearAllNeo4j);

export default router;

