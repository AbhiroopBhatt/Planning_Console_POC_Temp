import { Request, Response } from 'express';
import { query } from '../db/postgres';
import { logger } from '../utils/logger';

export const mlConfigController = {
  getAll: async (req: Request, res: Response) => {
    try {
      const result = await query('SELECT * FROM ml_model_configs ORDER BY created_at DESC');
      res.json({ success: true, data: result.rows });
    } catch (error) {
      logger.error('Error fetching ML configs', error);
      res.status(500).json({ success: false, error: 'Failed to fetch ML configs' });
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await query('SELECT * FROM ml_model_configs WHERE config_id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'ML config not found' });
      }
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error fetching ML config', error);
      res.status(500).json({ success: false, error: 'Failed to fetch ML config' });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const { model_name, model_type, config_json, is_active } = req.body;
      
      const result = await query(
        `INSERT INTO ml_model_configs (model_name, model_type, config_json, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [model_name, model_type, JSON.stringify(config_json), is_active ?? true]
      );
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error creating ML config', error);
      res.status(500).json({ success: false, error: 'Failed to create ML config' });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { model_name, model_type, config_json, is_active } = req.body;
      
      const result = await query(
        `UPDATE ml_model_configs
         SET model_name = $1, model_type = $2, config_json = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP
         WHERE config_id = $5
         RETURNING *`,
        [model_name, model_type, JSON.stringify(config_json), is_active, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'ML config not found' });
      }
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error updating ML config', error);
      res.status(500).json({ success: false, error: 'Failed to update ML config' });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await query('DELETE FROM ml_model_configs WHERE config_id = $1', [id]);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting ML config', error);
      res.status(500).json({ success: false, error: 'Failed to delete ML config' });
    }
  },

  toggleActive: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { is_active } = req.body;
      
      const result = await query(
        `UPDATE ml_model_configs
         SET is_active = $1, updated_at = CURRENT_TIMESTAMP
         WHERE config_id = $2
         RETURNING *`,
        [is_active, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'ML config not found' });
      }
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error toggling ML config active status', error);
      res.status(500).json({ success: false, error: 'Failed to toggle ML config' });
    }
  },

  testModel: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { test_data } = req.body;
      
      // Get ML config
      const configResult = await query('SELECT * FROM ml_model_configs WHERE config_id = $1', [id]);
      if (configResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'ML config not found' });
      }
      
      const config = configResult.rows[0];
      
      // Call ML service (placeholder - would call actual ML service)
      // For now, return a mock response
      const mockPrediction = {
        predicted_volume: Math.random() * 1000,
        confidence: Math.random() * 100,
        model_version: config.config_json?.version || '1.0'
      };
      
      res.json({ success: true, data: mockPrediction });
    } catch (error) {
      logger.error('Error testing ML model', error);
      res.status(500).json({ success: false, error: 'Failed to test ML model' });
    }
  }
};

