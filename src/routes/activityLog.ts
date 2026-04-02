import { Router, Response } from 'express';
import db from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest, ActivityLog } from '../types';

const router = Router();
router.use(authMiddleware);

// GET /api/activity-log
router.get('/', (_req: AuthRequest, res: Response): void => {
  const logs = db.prepare(`
    SELECT * FROM activity_log
    ORDER BY created_at DESC
    LIMIT 10
  `).all() as ActivityLog[];

  res.json({ data: logs });
});

export default router;
