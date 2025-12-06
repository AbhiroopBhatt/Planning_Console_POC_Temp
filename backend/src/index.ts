import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// Routes
import hierarchyRoutes from './routes/hierarchy';
import mlConfigRoutes from './routes/mlConfig';
import promotionsRoutes from './routes/promotions';
import semanticRoutes from './routes/semantic';
import analyticsRoutes from './routes/analytics';
import calendarRoutes from './routes/calendar';
import fundRoutes from './routes/fund';
import dataManagementRoutes from './routes/dataManagement';
import duckdbRoutes from './routes/duckdb';
import factDataRoutes from './routes/factData';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/hierarchy', hierarchyRoutes);
app.use('/api/ml-config', mlConfigRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/semantic', semanticRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/fund', fundRoutes);
app.use('/api/data-management', dataManagementRoutes);
app.use('/api/duckdb', duckdbRoutes);
app.use('/api/fact-data', factDataRoutes);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

export default app;

