import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import * as analyticsService from '../services/analytics.service';

const router = Router();
router.use(authMiddleware);

// GET /api/analytics
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const data = await analyticsService.getAnalyticsData();
  res.json({ data });
});

export default router;
