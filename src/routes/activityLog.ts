import { Router, Response } from 'express';
import ActivityLog from '../models/ActivityLog';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authMiddleware);

// GET /api/activity-log
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const logs = await ActivityLog.find().sort({ created_at: -1 }).limit(10);
  res.json({ data: logs });
});

export default router;
