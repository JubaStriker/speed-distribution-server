import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ServiceError } from '../services/errors';
import * as productService from '../services/product.service';

const router = Router();
router.use(authMiddleware);

const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  category_id: z.string().min(1, 'Category ID is required'),
  price: z.number().positive('Price must be positive'),
  stock_quantity: z.number().int().min(0, 'Stock quantity cannot be negative'),
  min_stock_threshold: z.number().int().min(0, 'Min stock threshold cannot be negative'),
});

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  category_id: z.string().optional(),
  price: z.number().positive().optional(),
  stock_quantity: z.number().int().min(0).optional(),
  min_stock_threshold: z.number().int().min(0).optional(),
  status: z.enum(['active', 'out_of_stock']).optional(),
});

// GET /api/products
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { q, category_id, status, page, limit } = req.query;
  const result = await productService.getProducts({
    q: q as string,
    category_id: category_id as string,
    status: status as string,
    page: page as string,
    limit: limit as string,
  });
  res.json(result);
});

// POST /api/products
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  try {
    const product = await productService.createProduct(parsed.data, req.user!.email);
    res.status(201).json({ data: product });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

// PUT /api/products/:id
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  try {
    const product = await productService.updateProduct(String(req.params['id']), parsed.data, req.user!.email);
    res.json({ data: product });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await productService.deleteProduct(String(req.params['id']), req.user!.email);
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

export default router;
