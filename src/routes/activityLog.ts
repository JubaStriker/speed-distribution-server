import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import * as activityLogService from '../services/activityLog.service';

const router = Router();
router.use(authMiddleware);

// GET /api/activity-log?page=1&limit=20&userId=xxx&method=POST
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const userId = req.query.userId as string | undefined;
  const method = req.query.method as string | undefined;

  const result = await activityLogService.getActivityLogs({ page, limit, userId, method });
  res.json(result);
});

export default router;
