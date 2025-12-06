import { Router } from 'express';
import { promotionsController } from '../controllers/promotionsController';

const router = Router();

// Get all promotions
router.get('/', promotionsController.getAll);

// Create fact promotion (must come before /:id routes)
router.post('/create-fact', promotionsController.createFactPromotion);

// Update volumes for Fact_Promotions (must come before /fact/:id routes to avoid route conflict)
router.put('/fact/volumes', promotionsController.updateVolumes);

// Re-estimate volumes for Fact_Promotions (must come before /fact/:id to avoid route conflict)
router.post('/fact/:id/reestimate', promotionsController.reestimateVolumes);

// Update promotion scope (must come before /fact/:id to avoid route conflict)
router.put('/fact/:id/scope', promotionsController.updatePromotionScope);

// Update individual promotion line (must come before /fact/:id to avoid route conflict)
router.put('/fact/:id/line/:lineId', promotionsController.updatePromotionLine);

// Delete promotion lines (must come before /fact/:id to avoid route conflict)
router.delete('/fact/:id/lines', promotionsController.deletePromotionLines);

// Delete multiple promotions in bulk (must come before /fact/:promotionId to avoid route conflict)
router.delete('/fact/bulk', promotionsController.deleteFactPromotionsBulk);

// Delete entire promotion by Promotion_ID (must come before /fact/:id to avoid route conflict)
// Note: Express route parameter names don't affect matching, so /fact/:promotionId and /fact/:id are the same pattern
// This route must come before the GET /fact/:id route to be matched first
router.delete('/fact/:promotionId', promotionsController.deleteFactPromotion);

// Get Fact_Promotions by promo_id (must come after more specific routes)
router.get('/fact/:id', promotionsController.getFactPromotionById);

// Get promotion by ID
router.get('/:id', promotionsController.getById);

// Create promotion
router.post('/', promotionsController.create);

// Update promotion
router.put('/:id', promotionsController.update);

// Delete promotion
router.delete('/:id', promotionsController.delete);

// Get promotion items
router.get('/:id/items', promotionsController.getItems);

// Add promotion item
router.post('/:id/items', promotionsController.addItem);

// Update promotion item
router.put('/:id/items/:itemId', promotionsController.updateItem);

// Delete promotion item
router.delete('/:id/items/:itemId', promotionsController.deleteItem);

// Estimate volumes for promotion
router.post('/:id/estimate', promotionsController.estimateVolumes);

export default router;

