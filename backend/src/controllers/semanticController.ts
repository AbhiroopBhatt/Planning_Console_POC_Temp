import { Request, Response } from 'express';
import { semanticLayer } from '../services/semanticLayer';
import { logger } from '../utils/logger';

export const semanticController = {
  aggregate: async (req: Request, res: Response) => {
    try {
      const { dimensions, measures, filters } = req.body;
      const data = await semanticLayer.getAggregatedData(dimensions, measures, filters);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error aggregating data', error);
      res.status(500).json({ success: false, error: 'Failed to aggregate data' });
    }
  },

  rollup: async (req: Request, res: Response) => {
    try {
      const { level, dimensions, measures } = req.body;
      const data = await semanticLayer.rollup(level, dimensions, measures);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error rolling up data', error);
      res.status(500).json({ success: false, error: 'Failed to roll up data' });
    }
  },

  distribute: async (req: Request, res: Response) => {
    try {
      const { total, method, targets } = req.body;
      const distribution = await semanticLayer.distribute(total, method, targets);
      res.json({ success: true, data: distribution });
    } catch (error) {
      logger.error('Error distributing values', error);
      res.status(500).json({ success: false, error: 'Failed to distribute values' });
    }
  },

  createView: async (req: Request, res: Response) => {
    try {
      const { name, sql } = req.body;
      await semanticLayer.createMaterializedView(name, sql);
      res.json({ success: true, message: `View ${name} created successfully` });
    } catch (error) {
      logger.error('Error creating view', error);
      res.status(500).json({ success: false, error: 'Failed to create view' });
    }
  },

  getViews: async (req: Request, res: Response) => {
    try {
      // Get list of views from DuckDB
      const views = await semanticLayer.getViews();
      res.json({ success: true, data: views });
    } catch (error) {
      logger.error('Error getting views', error);
      res.status(500).json({ success: false, error: 'Failed to get views' });
    }
  },

  sync: async (req: Request, res: Response) => {
    try {
      await semanticLayer.syncFromPostgres();
      res.json({ success: true, message: 'Data synced successfully' });
    } catch (error) {
      logger.error('Error syncing data', error);
      res.status(500).json({ success: false, error: 'Failed to sync data' });
    }
  }
};

