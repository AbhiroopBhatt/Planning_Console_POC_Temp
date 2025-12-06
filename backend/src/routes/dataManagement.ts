import { Router } from 'express';
import { dataManagementController } from '../controllers/dataManagementController';

const router = Router();

// Get all tables
router.get('/tables', dataManagementController.getTables);

// Get table data
router.get('/tables/:tableName', dataManagementController.getTableData);

// Get table schema
router.get('/tables/:tableName/schema', dataManagementController.getTableSchema);

// Get table row count
router.get('/tables/:tableName/count', dataManagementController.getTableCount);

export default router;

