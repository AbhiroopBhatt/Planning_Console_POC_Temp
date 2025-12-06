import { Router } from 'express';
import { mlConfigController } from '../controllers/mlConfigController';

const router = Router();

// Get all ML model configurations
router.get('/', mlConfigController.getAll);

// Get ML model configuration by ID
router.get('/:id', mlConfigController.getById);

// Create ML model configuration
router.post('/', mlConfigController.create);

// Update ML model configuration
router.put('/:id', mlConfigController.update);

// Delete ML model configuration
router.delete('/:id', mlConfigController.delete);

// Activate/deactivate ML model
router.patch('/:id/activate', mlConfigController.toggleActive);

// Test ML model
router.post('/:id/test', mlConfigController.testModel);

export default router;

