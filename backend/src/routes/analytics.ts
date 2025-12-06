import { Router } from 'express';
import { analyticsController } from '../controllers/analyticsController';

const router = Router();

// Get insights/dashboard data
router.get('/dashboard', analyticsController.getDashboard);

// Get volume trends
router.get('/trends', analyticsController.getTrends);

// Get performance metrics
router.get('/metrics', analyticsController.getMetrics);

export default router;

