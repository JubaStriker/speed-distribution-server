import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ServiceError } from '../services/errors';
import * as orderService from '../services/order.service';

const router = Router();
router.use(authMiddleware);

const createOrderSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  items: z
    .array(
      z.object({
        product_id: z.string().min(1, 'Product ID is required'),
        quantity: z.number().int().positive('Quantity must be a positive integer'),
      })
    )
    .min(1, 'At least one item is required'),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']),
});

// GET /api/orders
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, date, page, limit } = req.query;
  const result = await orderService.getOrders({
    status: status as string,
    date: date as string,
    page: page as string,
    limit: limit as string,
  });
  res.json(result);
});

// POST /api/orders
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  try {
    const order = await orderService.createOrder(parsed.data);
    res.status(201).json({ data: order });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

// GET /api/orders/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await orderService.getOrder(String(req.params['id']));
    res.json({ data: order });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

// PUT /api/orders/:id/status
router.put('/:id/status', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  try {
    const order = await orderService.updateOrderStatus(String(req.params['id']), parsed.data.status);
    res.json({ data: order });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

// DELETE /api/orders/:id — cancel order
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await orderService.cancelOrder(String(req.params['id']));
    res.json({ message: 'Order cancelled successfully' });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

export default router;
