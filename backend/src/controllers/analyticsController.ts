import { Request, Response } from 'express';
import { query } from '../db/postgres';
import { logger } from '../utils/logger';

export const analyticsController = {
  getDashboard: async (req: Request, res: Response) => {
    try {
      // Get summary statistics
      const stats = await query(`
        SELECT 
          COUNT(DISTINCT p.promotion_id) as total_promotions,
          COUNT(DISTINCT pi.promotion_item_id) as total_items,
          SUM(pi.estimated_volume) as total_estimated_volume,
          AVG(pi.estimated_volume) as avg_volume_per_item
        FROM promotions p
        LEFT JOIN promotion_items pi ON p.promotion_id = pi.promotion_id
        WHERE p.status != 'deleted'
      `);
      
      res.json({ success: true, data: stats.rows[0] });
    } catch (error) {
      logger.error('Error fetching dashboard data', error);
      res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
    }
  },

  getTrends: async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, dimension } = req.query;
      
      const result = await query(`
        SELECT 
          t.date,
          SUM(bv.volume) as total_volume,
          COUNT(DISTINCT bv.product_id) as product_count
        FROM baseline_volumes bv
        JOIN time t ON bv.time_id = t.time_id
        WHERE t.date >= $1 AND t.date <= $2
        GROUP BY t.date
        ORDER BY t.date
      `, [startDate, endDate]);
      
      res.json({ success: true, data: result.rows });
    } catch (error) {
      logger.error('Error fetching trends', error);
      res.status(500).json({ success: false, error: 'Failed to fetch trends' });
    }
  },

  getMetrics: async (req: Request, res: Response) => {
    try {
      const { promotionId } = req.query;
      
      if (!promotionId) {
        return res.status(400).json({ success: false, error: 'promotionId is required' });
      }
      
      const result = await query(`
        SELECT 
          SUM(pi.estimated_volume * p.promo_price) as estimated_revenue,
          SUM(pi.estimated_volume * c.cogs) as estimated_cost,
          SUM(pi.estimated_volume * (p.promo_price - c.cogs)) as estimated_profit,
          COUNT(DISTINCT pi.product_id) as product_count,
          COUNT(DISTINCT pi.customer_id) as customer_count
        FROM promotion_items pi
        JOIN promotions pr ON pi.promotion_id = pr.promotion_id
        JOIN prices p ON pi.product_id = p.product_id AND pi.customer_id = p.customer_id
        JOIN costs c ON pi.product_id = c.product_id AND pi.customer_id = c.customer_id
        WHERE pi.promotion_id = $1
        LIMIT 1
      `, [promotionId]);
      
      res.json({ success: true, data: result.rows[0] || {} });
    } catch (error) {
      logger.error('Error fetching metrics', error);
      res.status(500).json({ success: false, error: 'Failed to fetch metrics' });
    }
  }
};

