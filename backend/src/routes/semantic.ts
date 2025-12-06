import { Router } from 'express';
import { semanticController } from '../controllers/semanticController';

const router = Router();

// Get aggregated data
router.post('/aggregate', semanticController.aggregate);

// Roll-up data
router.post('/rollup', semanticController.rollup);

// Distribute values
router.post('/distribute', semanticController.distribute);

// Create materialized view
router.post('/views', semanticController.createView);

// Get materialized views
router.get('/views', semanticController.getViews);

// Sync from PostgreSQL
router.post('/sync', semanticController.sync);

export default router;

