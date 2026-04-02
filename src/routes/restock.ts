import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest, Product } from '../types';

const router = Router();
router.use(authMiddleware);

const restockSchema = z.object({
  quantity_to_add: z.number().int().positive('Quantity to add must be a positive integer'),
});

interface RestockItem {
  id: number;
  product_id: number;
  added_at: string;
  name: string;
  stock_quantity: number;
  min_stock_threshold: number;
  status: string;
  category_name: string | null;
  priority: 'High' | 'Medium' | 'Low';
}

function getPriority(stock: number, threshold: number): 'High' | 'Medium' | 'Low' {
  if (stock === 0) return 'High';
  if (stock <= Math.floor(threshold / 2)) return 'Medium';
  return 'Low';
}

// GET /api/restock
router.get('/', (_req: AuthRequest, res: Response): void => {
  const items = db.prepare(`
    SELECT
      rq.id,
      rq.product_id,
      rq.added_at,
      p.name,
      p.stock_quantity,
      p.min_stock_threshold,
      p.status,
      c.name as category_name
    FROM restock_queue rq
    JOIN products p ON rq.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.stock_quantity ASC
  `).all() as Omit<RestockItem, 'priority'>[];

  const itemsWithPriority: RestockItem[] = items.map((item) => ({
    ...item,
    priority: getPriority(item.stock_quantity, item.min_stock_threshold),
  }));

  res.json({ data: itemsWithPriority });
});

// PUT /api/restock/:product_id/restock
router.put('/:product_id/restock', (req: AuthRequest, res: Response): void => {
  const productId = parseInt(req.params['product_id'] as string, 10);
  if (isNaN(productId)) {
    res.status(400).json({ error: 'Invalid product ID' });
    return;
  }

  const parsed = restockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const { quantity_to_add } = parsed.data;

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Product | undefined;
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const doRestock = db.transaction(() => {
    const newStock = product.stock_quantity + quantity_to_add;
    const newStatus: Product['status'] = newStock > 0 ? 'active' : 'out_of_stock';

    db.prepare(`
      UPDATE products
      SET stock_quantity = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newStock, newStatus, productId);

    // Remove from restock queue if stock is now above threshold
    if (newStock >= product.min_stock_threshold) {
      db.prepare('DELETE FROM restock_queue WHERE product_id = ?').run(productId);
    }

    // Log activity
    db.prepare('INSERT INTO activity_log (message) VALUES (?)').run(
      `${product.name} restocked: +${quantity_to_add} units (total: ${newStock})`
    );

    return newStock;
  });

  const newStock = doRestock();

  const updatedProduct = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(productId) as Product & { category_name: string };

  const inQueue = db.prepare('SELECT id FROM restock_queue WHERE product_id = ?').get(productId);

  res.json({
    data: {
      product: updatedProduct,
      quantity_added: quantity_to_add,
      new_stock: newStock,
      removed_from_queue: !inQueue,
    },
  });
});

export default router;
