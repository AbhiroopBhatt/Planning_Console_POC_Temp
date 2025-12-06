import { Router } from 'express';
import { factDataController } from '../controllers/factDataController';

const router = Router();

// Get customer hierarchy from Neo4j
router.get('/customers/hierarchy', factDataController.getCustomerHierarchy);

// Get category hierarchy from Neo4j
router.get('/categories/hierarchy', factDataController.getCategoryHierarchy);

// Get brand hierarchy from Neo4j
router.get('/brands/hierarchy', factDataController.getBrandHierarchy);

// Get all products (optionally filtered by category and brand)
router.get('/products', factDataController.getProducts);

// Get prices report
router.get('/prices', factDataController.getPricesReport);

// Get time hierarchy
router.get('/time/hierarchy', factDataController.getTimeHierarchy);

// Get costs report
router.get('/costs', factDataController.getCostsReport);

// Get region hierarchy from Neo4j
router.get('/regions/hierarchy', factDataController.getRegionHierarchy);

// Get all channels
router.get('/channels', factDataController.getChannels);

export default router;
