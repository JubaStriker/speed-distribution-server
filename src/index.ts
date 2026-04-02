import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { connectDB } from './db/database';
import authRoutes from './routes/auth';
import categoriesRoutes from './routes/categories';
import productsRoutes from './routes/products';
import ordersRoutes from './routes/orders';
import restockRoutes from './routes/restock';
import dashboardRoutes from './routes/dashboard';
import activityLogRoutes from './routes/activityLog';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3001;

// Security & parsing middleware
app.use(helmet());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/restock', restockRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/activity-log', activityLogRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use(errorHandler);

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

export default app;
