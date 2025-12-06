import express from 'express';
import { hierarchyController } from '../controllers/hierarchyController';

const router = express.Router();

// New endpoints for node selection
router.get('/tables', hierarchyController.getTables);
router.post('/tables/details', hierarchyController.getTableDetails);

// Relationship management endpoints
router.get('/relationships', hierarchyController.getRelationships);
router.post('/relationships', hierarchyController.createRelationship);
router.put('/relationships/:id', hierarchyController.updateRelationship);
router.delete('/relationships/:id', hierarchyController.deleteRelationship);

// Build graph endpoint
router.post('/build-graph', hierarchyController.buildGraph);

// Log file endpoints
router.get('/logs', hierarchyController.listLogFiles);
router.get('/logs/:filename', hierarchyController.getLogFile);

// Legacy endpoints (for backward compatibility)
router.get('/configs', hierarchyController.getConfigs);
router.post('/configs', hierarchyController.createConfig);
router.put('/configs/:id', hierarchyController.updateConfig);
router.delete('/configs/:id', hierarchyController.deleteConfig);
router.post('/sync/:id', hierarchyController.syncToNeo4j);
router.get('/tree/:configId', hierarchyController.getHierarchyTree);
router.get('/tables/legacy', hierarchyController.getAvailableTables);

export default router;
