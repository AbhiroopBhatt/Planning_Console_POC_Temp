import { Request, Response } from 'express';
import { query } from '../db/postgres';
import { logger } from '../utils/logger';

export const calendarController = {
  getEvents: async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      
      const result = await query(
        `SELECT 
          p.promotion_id as id,
          p.promotion_name as title,
          p.start_date as start,
          p.end_date as end,
          p.status,
          COUNT(pi.promotion_item_id) as item_count
         FROM promotions p
         LEFT JOIN promotion_items pi ON p.promotion_id = pi.promotion_id
         WHERE p.start_date >= $1 AND p.end_date <= $2
         GROUP BY p.promotion_id, p.promotion_name, p.start_date, p.end_date, p.status
         ORDER BY p.start_date`,
        [startDate, endDate]
      );
      
      res.json({ success: true, data: result.rows });
    } catch (error) {
      logger.error('Error fetching calendar events', error);
      res.status(500).json({ success: false, error: 'Failed to fetch calendar events' });
    }
  },

  createEvent: async (req: Request, res: Response) => {
    try {
      const { title, start, end, description } = req.body;
      
      const result = await query(
        `INSERT INTO promotions (promotion_name, description, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, 'draft')
         RETURNING *`,
        [title, description, start, end]
      );
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error creating calendar event', error);
      res.status(500).json({ success: false, error: 'Failed to create calendar event' });
    }
  },

  updateEvent: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title, start, end, description } = req.body;
      
      const result = await query(
        `UPDATE promotions
         SET promotion_name = $1, description = $2, start_date = $3, end_date = $4, updated_at = CURRENT_TIMESTAMP
         WHERE promotion_id = $5
         RETURNING *`,
        [title, description, start, end, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Event not found' });
      }
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error updating calendar event', error);
      res.status(500).json({ success: false, error: 'Failed to update calendar event' });
    }
  },

  deleteEvent: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await query('DELETE FROM promotions WHERE promotion_id = $1', [id]);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting calendar event', error);
      res.status(500).json({ success: false, error: 'Failed to delete calendar event' });
    }
  }
};

