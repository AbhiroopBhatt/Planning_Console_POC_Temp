import { Router } from 'express';
import { fundController } from '../controllers/fundController';

const router = Router();

// Get fund allocation
router.get('/allocation', fundController.getAllocation);

// Get fund summary
router.get('/summary', fundController.getSummary);

// Update fund allocation
router.put('/allocation', fundController.updateAllocation);

export default router;

