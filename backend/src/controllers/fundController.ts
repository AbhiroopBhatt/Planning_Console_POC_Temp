import { Request, Response } from 'express';
import { query } from '../db/postgres';
import { logger } from '../utils/logger';

export const fundController = {
  getAllocation: async (req: Request, res: Response) => {
    try {
      const { period } = req.query;
      
      // Calculate fund allocation based on promotions
      const result = await query(
        `SELECT 
          p.promotion_id,
          p.promotion_name,
          SUM(pi.estimated_volume * (pr.promo_price - c.cogs)) as allocated_fund,
          SUM(pi.estimated_volume * pr.promo_price) as estimated_revenue
         FROM promotions p
         JOIN promotion_items pi ON p.promotion_id = pi.promotion_id
         JOIN prices pr ON pi.product_id = pr.product_id AND pi.customer_id = pr.customer_id
         JOIN costs c ON pi.product_id = c.product_id AND pi.customer_id = c.customer_id
         WHERE p.status != 'deleted'
         GROUP BY p.promotion_id, p.promotion_name
         ORDER BY p.start_date`,
        []
      );
      
      res.json({ success: true, data: result.rows });
    } catch (error) {
      logger.error('Error fetching fund allocation', error);
      res.status(500).json({ success: false, error: 'Failed to fetch fund allocation' });
    }
  },

  getSummary: async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT 
          SUM(pi.estimated_volume * (pr.promo_price - c.cogs)) as total_allocated,
          SUM(pi.estimated_volume * pr.promo_price) as total_revenue,
          COUNT(DISTINCT p.promotion_id) as promotion_count
         FROM promotions p
         JOIN promotion_items pi ON p.promotion_id = pi.promotion_id
         JOIN prices pr ON pi.product_id = pr.product_id AND pi.customer_id = pr.customer_id
         JOIN costs c ON pi.product_id = c.product_id AND pi.customer_id = c.customer_id
         WHERE p.status != 'deleted'`,
        []
      );
      
      res.json({ success: true, data: result.rows[0] || {} });
    } catch (error) {
      logger.error('Error fetching fund summary', error);
      res.status(500).json({ success: false, error: 'Failed to fetch fund summary' });
    }
  },

  updateAllocation: async (req: Request, res: Response) => {
    try {
      // This would update fund allocation rules
      // For now, it's a placeholder
      res.json({ success: true, message: 'Fund allocation updated' });
    } catch (error) {
      logger.error('Error updating fund allocation', error);
      res.status(500).json({ success: false, error: 'Failed to update fund allocation' });
    }
  }
};

