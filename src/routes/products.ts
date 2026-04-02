import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest, Product } from '../types';

const router = Router();
router.use(authMiddleware);

const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  category_id: z.number().int().positive('Category ID must be a positive integer'),
  price: z.number().positive('Price must be positive'),
  stock_quantity: z.number().int().min(0, 'Stock quantity cannot be negative'),
  min_stock_threshold: z.number().int().min(0, 'Min stock threshold cannot be negative'),
});

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  category_id: z.number().int().positive().optional(),
  price: z.number().positive().optional(),
  stock_quantity: z.number().int().min(0).optional(),
  min_stock_threshold: z.number().int().min(0).optional(),
  status: z.enum(['active', 'out_of_stock']).optional(),
});

// GET /api/products
router.get('/', (req: AuthRequest, res: Response): void => {
  const { q, category_id, status, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  let query = `
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (q) {
    query += ' AND p.name LIKE ?';
    params.push(`%${q as string}%`);
  }
  if (category_id) {
    query += ' AND p.category_id = ?';
    params.push(parseInt(category_id as string, 10));
  }
  if (status) {
    query += ' AND p.status = ?';
    params.push(status as string);
  }

  const countQuery = query.replace(
    'SELECT p.*, c.name as category_name',
    'SELECT COUNT(*) as total'
  );
  const countResult = db.prepare(countQuery).get(params) as { total: number };
  const total = countResult.total;

  query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  const allParams = [...params, limitNum, offset];

  const products = db.prepare(query).all(allParams) as (Product & { category_name: string })[];

  res.json({
    data: products,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.ceil(total / limitNum),
    },
  });
});

// POST /api/products
router.post('/', (req: AuthRequest, res: Response): void => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const { name, category_id, price, stock_quantity, min_stock_threshold } = parsed.data;

  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
  if (!category) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  const status: Product['status'] = stock_quantity === 0 ? 'out_of_stock' : 'active';

  const result = db.prepare(`
    INSERT INTO products (name, category_id, price, stock_quantity, min_stock_threshold, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, category_id, price, stock_quantity, min_stock_threshold, status);

  const product = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(result.lastInsertRowid) as Product & { category_name: string };

  // Add to restock queue if below threshold
  if (stock_quantity < min_stock_threshold) {
    db.prepare('INSERT OR IGNORE INTO restock_queue (product_id) VALUES (?)').run(product.id);
  }

  res.status(201).json({ data: product });
});

// PUT /api/products/:id
router.put('/:id', (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid product ID' });
    return;
  }

  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  if (parsed.data.category_id) {
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(parsed.data.category_id);
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
  }

  const updates = parsed.data;
  const newStock = updates.stock_quantity !== undefined ? updates.stock_quantity : existing.stock_quantity;
  const newThreshold = updates.min_stock_threshold !== undefined ? updates.min_stock_threshold : existing.min_stock_threshold;

  // Auto-set status based on stock if not explicitly provided
  let newStatus = updates.status !== undefined ? updates.status : existing.status;
  if (updates.stock_quantity !== undefined) {
    if (newStock === 0) {
      newStatus = 'out_of_stock';
    } else if (newStock > 0 && existing.status === 'out_of_stock' && updates.status === undefined) {
      newStatus = 'active';
    }
  }

  db.prepare(`
    UPDATE products
    SET name = ?, category_id = ?, price = ?, stock_quantity = ?,
        min_stock_threshold = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    updates.name ?? existing.name,
    updates.category_id ?? existing.category_id,
    updates.price ?? existing.price,
    newStock,
    newThreshold,
    newStatus,
    id
  );

  // Manage restock queue based on new stock level
  if (newStock < newThreshold) {
    db.prepare('INSERT OR IGNORE INTO restock_queue (product_id) VALUES (?)').run(id);
  } else {
    db.prepare('DELETE FROM restock_queue WHERE product_id = ?').run(id);
  }

  const product = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(id) as Product & { category_name: string };

  res.json({ data: product });
});

// DELETE /api/products/:id
router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid product ID' });
    return;
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  // Check if product is in any orders
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM order_items WHERE product_id = ?').get(id) as { count: number };
  if (orderCount.count > 0) {
    res.status(409).json({ error: 'Cannot delete product that has associated orders' });
    return;
  }

  db.prepare('DELETE FROM restock_queue WHERE product_id = ?').run(id);
  db.prepare('DELETE FROM products WHERE id = ?').run(id);

  res.json({ message: 'Product deleted successfully' });
});

export default router;
