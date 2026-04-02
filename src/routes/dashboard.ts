import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import * as dashboardService from '../services/dashboard.service';

const router = Router();
router.use(authMiddleware);

// GET /api/dashboard
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const data = await dashboardService.getDashboardData();
  res.json({ data });
});

export default router;
