import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import Category from '../models/Category';
import Product from '../models/Product';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authMiddleware);

const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
});

// GET /api/categories
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const categories = await Category.find().sort({ name: 1 });
  res.json({ data: categories });
});

// POST /api/categories
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const { name } = parsed.data;

  const existing = await Category.findOne({ name });
  if (existing) {
    res.status(409).json({ error: 'Category with this name already exists' });
    return;
  }

  const category = await Category.create({ name });
  res.status(201).json({ data: category });
});

// DELETE /api/categories/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params['id']);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid category ID' });
    return;
  }

  const category = await Category.findById(id);
  if (!category) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  const productCount = await Product.countDocuments({ category_id: new mongoose.Types.ObjectId(id) });
  if (productCount > 0) {
    res.status(409).json({ error: 'Cannot delete category with associated products' });
    return;
  }

  await Category.findByIdAndDelete(id);
  res.json({ message: 'Category deleted successfully' });
});

export default router;
