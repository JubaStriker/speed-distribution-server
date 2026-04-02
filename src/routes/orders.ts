import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest, Order, OrderItem, Product } from '../types';

const router = Router();
router.use(authMiddleware);

const createOrderSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive('Product ID must be a positive integer'),
        quantity: z.number().int().positive('Quantity must be a positive integer'),
      })
    )
    .min(1, 'At least one item is required'),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']),
});

function logActivity(message: string): void {
  db.prepare('INSERT INTO activity_log (message) VALUES (?)').run(message);
}

// GET /api/orders
router.get('/', (req: AuthRequest, res: Response): void => {
  const { status, date, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  let query = 'SELECT * FROM orders WHERE 1=1';
  const params: (string | number)[] = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status as string);
  }

  if (date === 'today') {
    query += " AND DATE(created_at) = DATE('now')";
  }

  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countResult = db.prepare(countQuery).get(params) as { total: number };
  const total = countResult.total;

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const allParams = [...params, limitNum, offset];

  const orders = db.prepare(query).all(allParams) as Order[];

  res.json({
    data: orders,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.ceil(total / limitNum),
    },
  });
});

// POST /api/orders
router.post('/', (req: AuthRequest, res: Response): void => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const { customer_name, items } = parsed.data;

  // 1. Check for duplicate product_ids in request
  const productIds = items.map((i) => i.product_id);
  const uniqueIds = new Set(productIds);
  if (uniqueIds.size !== productIds.length) {
    res.status(409).json({ error: 'This product is already added to the order.' });
    return;
  }

  // 2. Validate each product
  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as Product | undefined;

    if (!product) {
      res.status(404).json({ error: `Product with ID ${item.product_id} not found` });
      return;
    }

    if (product.status !== 'active') {
      res.status(409).json({ error: 'This product is currently unavailable.' });
      return;
    }

    if (product.stock_quantity < item.quantity) {
      res.status(400).json({ error: `Only ${product.stock_quantity} items available in stock` });
      return;
    }
  }

  // 3. All valid — create order in a transaction
  const createOrder = db.transaction(() => {
    // Calculate total price
    let total_price = 0;
    const itemDetails: Array<{ product: Product; quantity: number }> = [];

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as Product;
      total_price += product.price * item.quantity;
      itemDetails.push({ product, quantity: item.quantity });
    }

    // Create order
    const orderResult = db.prepare(`
      INSERT INTO orders (customer_name, status, total_price)
      VALUES (?, 'pending', ?)
    `).run(customer_name, total_price);

    const orderId = orderResult.lastInsertRowid as number;

    // Create order items and deduct stock
    for (const { product, quantity } of itemDetails) {
      db.prepare(`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES (?, ?, ?, ?)
      `).run(orderId, product.id, quantity, product.price);

      const newStock = product.stock_quantity - quantity;

      // Determine new status
      const newStatus: Product['status'] = newStock === 0 ? 'out_of_stock' : 'active';

      db.prepare(`
        UPDATE products
        SET stock_quantity = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStock, newStatus, product.id);

      // Add to restock queue if below threshold
      if (newStock < product.min_stock_threshold) {
        db.prepare('INSERT OR IGNORE INTO restock_queue (product_id) VALUES (?)').run(product.id);
      }
    }

    // Log activity
    logActivity(`Order #${orderId} created for ${customer_name}`);

    return orderId;
  });

  const orderId = createOrder();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Order;
  const orderItems = db.prepare(`
    SELECT oi.*, p.name as product_name
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).all(orderId) as (OrderItem & { product_name: string })[];

  res.status(201).json({ data: { ...order, items: orderItems } });
});

// GET /api/orders/:id
router.get('/:id', (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined;
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  const items = db.prepare(`
    SELECT oi.*, p.name as product_name, p.status as product_status
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).all(id) as (OrderItem & { product_name: string; product_status: string })[];

  res.json({ data: { ...order, items } });
});

// PUT /api/orders/:id/status
router.put('/:id/status', (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const { status } = parsed.data;

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined;
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  if (order.status === 'cancelled') {
    res.status(409).json({ error: 'Cannot update status of a cancelled order' });
    return;
  }

  if (order.status === status) {
    res.status(409).json({ error: `Order is already in '${status}' status` });
    return;
  }

  const updateStatus = db.transaction(() => {
    db.prepare(`
      UPDATE orders
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, id);

    if (status === 'cancelled') {
      // Restore stock for all order items
      const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id) as OrderItem[];

      for (const item of orderItems) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as Product;
        const restoredStock = product.stock_quantity + item.quantity;

        db.prepare(`
          UPDATE products
          SET stock_quantity = ?, status = 'active', updated_at = datetime('now')
          WHERE id = ?
        `).run(restoredStock, product.id);

        // Re-check if product should still be in restock queue
        if (restoredStock >= product.min_stock_threshold) {
          db.prepare('DELETE FROM restock_queue WHERE product_id = ?').run(product.id);
        }
      }

      logActivity(`Order #${id} cancelled`);
    } else {
      logActivity(`Order #${id} marked as ${status}`);
    }
  });

  updateStatus();

  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order;
  const items = db.prepare(`
    SELECT oi.*, p.name as product_name
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).all(id) as (OrderItem & { product_name: string })[];

  res.json({ data: { ...updatedOrder, items } });
});

// DELETE /api/orders/:id — cancel order
router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined;
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  if (order.status === 'cancelled') {
    res.status(409).json({ error: 'Order is already cancelled' });
    return;
  }

  const cancelOrder = db.transaction(() => {
    db.prepare(`
      UPDATE orders
      SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id) as OrderItem[];

    for (const item of orderItems) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as Product;
      const restoredStock = product.stock_quantity + item.quantity;

      db.prepare(`
        UPDATE products
        SET stock_quantity = ?, status = 'active', updated_at = datetime('now')
        WHERE id = ?
      `).run(restoredStock, product.id);

      if (restoredStock >= product.min_stock_threshold) {
        db.prepare('DELETE FROM restock_queue WHERE product_id = ?').run(product.id);
      }
    }

    logActivity(`Order #${id} cancelled`);
  });

  cancelOrder();

  res.json({ message: 'Order cancelled successfully' });
});

export default router;
