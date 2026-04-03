import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import * as activityLogService from '../services/activityLog.service';

const router = Router();
router.use(authMiddleware);

// GET /api/activity-log
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const logs = await activityLogService.getActivityLogs();
  res.json({ data: logs });
});

export default router;
