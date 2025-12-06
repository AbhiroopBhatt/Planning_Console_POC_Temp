import { Router } from 'express';
import { calendarController } from '../controllers/calendarController';

const router = Router();

// Get calendar events
router.get('/events', calendarController.getEvents);

// Create calendar event
router.post('/events', calendarController.createEvent);

// Update calendar event
router.put('/events/:id', calendarController.updateEvent);

// Delete calendar event
router.delete('/events/:id', calendarController.deleteEvent);

export default router;

