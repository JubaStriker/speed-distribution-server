import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ServiceError } from '../services/errors';
import * as restockService from '../services/restock.service';

const router = Router();
router.use(authMiddleware);

const restockSchema = z.object({
  quantity_to_add: z.number().int().positive('Quantity to add must be a positive integer'),
});

// GET /api/restock
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const data = await restockService.getRestockQueue();
  res.json({ data });
});

// PUT /api/restock/:product_id/restock
router.put('/:product_id/restock', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = restockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  try {
    const result = await restockService.restockProduct(
      String(req.params['product_id']),
      parsed.data.quantity_to_add
    );
    res.json({ data: result });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

export default router;
