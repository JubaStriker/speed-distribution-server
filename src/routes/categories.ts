import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ServiceError } from '../services/errors';
import * as categoryService from '../services/category.service';

const router = Router();
router.use(authMiddleware);

const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
});

// GET /api/categories
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const categories = await categoryService.getCategories();
  res.json({ data: categories });
});

// POST /api/categories
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  try {
    const category = await categoryService.createCategory(parsed.data.name);
    res.status(201).json({ data: category });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

// DELETE /api/categories/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await categoryService.deleteCategory(String(req.params['id']));
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

export default router;
