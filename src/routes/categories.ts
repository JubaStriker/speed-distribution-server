import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest, Category } from '../types';

const router = Router();
router.use(authMiddleware);

const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
});

// GET /api/categories
router.get('/', (_req: AuthRequest, res: Response): void => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all() as Category[];
  res.json({ data: categories });
});

// POST /api/categories
router.post('/', (req: AuthRequest, res: Response): void => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const { name } = parsed.data;

  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (existing) {
    res.status(409).json({ error: 'Category with this name already exists' });
    return;
  }

  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid) as Category;

  res.status(201).json({ data: category });
});

// DELETE /api/categories/:id
router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid category ID' });
    return;
  }

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  // Check if any products reference this category
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(id) as { count: number };
  if (productCount.count > 0) {
    res.status(409).json({ error: 'Cannot delete category with associated products' });
    return;
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ message: 'Category deleted successfully' });
});

export default router;
