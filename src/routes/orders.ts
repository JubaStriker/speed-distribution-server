import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import Order from '../models/Order';
import Product from '../models/Product';
import RestockQueue from '../models/RestockQueue';
import ActivityLog from '../models/ActivityLog';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';

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

async function logActivity(message: string): Promise<void> {
  await ActivityLog.create({ message });
}

// GET /api/orders
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, date, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (date === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    filter.created_at = { $gte: start, $lte: end };
  }

  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter).sort({ created_at: -1 }).skip(skip).limit(limitNum),
  ]);

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
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const { customer_name, items } = parsed.data;

  // Check for duplicate product_ids in request
  const productIds = items.map((i) => i.product_id);
  if (new Set(productIds).size !== productIds.length) {
    res.status(409).json({ error: 'This product is already added to the order.' });
    return;
  }

  // Validate ObjectIds
  for (const item of items) {
    if (!mongoose.Types.ObjectId.isValid(item.product_id)) {
      res.status(400).json({ error: `Invalid product ID: ${item.product_id}` });
      return;
    }
  }

  // Validate each product
  const productDocs = [];
  for (const item of items) {
    const product = await Product.findById(item.product_id);
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
    productDocs.push({ product, quantity: item.quantity });
  }

  // Calculate total price and build order items
  let total_price = 0;
  const orderItems = productDocs.map(({ product, quantity }) => {
    total_price += product.price * quantity;
    return { product_id: product._id, quantity, unit_price: product.price };
  });

  // Create order
  const order = await Order.create({ customer_name, total_price, items: orderItems });

  // Deduct stock and manage restock queue
  for (const { product, quantity } of productDocs) {
    const newStock = product.stock_quantity - quantity;
    const newStatus = newStock === 0 ? 'out_of_stock' : 'active';

    await Product.findByIdAndUpdate(product._id, {
      stock_quantity: newStock,
      status: newStatus,
      updated_at: new Date(),
    });

    if (newStock < product.min_stock_threshold) {
      await RestockQueue.findOneAndUpdate(
        { product_id: product._id },
        { product_id: product._id },
        { upsert: true }
      );
    }
  }

  await logActivity(`Order #${order._id} created for ${customer_name}`);

  // Return order with product names
  const populatedOrder = await Order.findById(order._id).populate('items.product_id', 'name');
  const obj = populatedOrder!.toJSON() as Record<string, unknown>;
  const orderItems2 = (obj.items as Record<string, unknown>[]).map((item) => {
    const prod = item.product_id as Record<string, unknown> | null;
    return { ...item, product_name: prod ? prod.name : null, product_id: prod ? prod.id : item.product_id };
  });
  obj.items = orderItems2;

  res.status(201).json({ data: obj });
});

// GET /api/orders/:id
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  const order = await Order.findById(id).populate('items.product_id', 'name status');
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  const obj = order.toJSON() as Record<string, unknown>;
  const orderItems = (obj.items as Record<string, unknown>[]).map((item) => {
    const prod = item.product_id as Record<string, unknown> | null;
    return {
      ...item,
      product_name: prod ? prod.name : null,
      product_status: prod ? prod.status : null,
      product_id: prod ? prod.id : item.product_id,
    };
  });
  obj.items = orderItems;

  res.json({ data: obj });
});

// PUT /api/orders/:id/status
router.put('/:id/status', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const { status } = parsed.data;

  const order = await Order.findById(id);
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

  await Order.findByIdAndUpdate(id, { status, updated_at: new Date() });

  if (status === 'cancelled') {
    for (const item of order.items) {
      const product = await Product.findById(item.product_id);
      if (!product) continue;
      const restoredStock = product.stock_quantity + item.quantity;
      await Product.findByIdAndUpdate(product._id, {
        stock_quantity: restoredStock,
        status: 'active',
        updated_at: new Date(),
      });
      if (restoredStock >= product.min_stock_threshold) {
        await RestockQueue.deleteOne({ product_id: product._id });
      }
    }
    await logActivity(`Order #${id} cancelled`);
  } else {
    await logActivity(`Order #${id} marked as ${status}`);
  }

  const updatedOrder = await Order.findById(id).populate('items.product_id', 'name');
  const obj = updatedOrder!.toJSON() as Record<string, unknown>;
  const orderItems = (obj.items as Record<string, unknown>[]).map((item) => {
    const prod = item.product_id as Record<string, unknown> | null;
    return { ...item, product_name: prod ? prod.name : null, product_id: prod ? prod.id : item.product_id };
  });
  obj.items = orderItems;

  res.json({ data: obj });
});

// DELETE /api/orders/:id — cancel order
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  const order = await Order.findById(id);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  if (order.status === 'cancelled') {
    res.status(409).json({ error: 'Order is already cancelled' });
    return;
  }

  await Order.findByIdAndUpdate(id, { status: 'cancelled', updated_at: new Date() });

  for (const item of order.items) {
    const product = await Product.findById(item.product_id);
    if (!product) continue;
    const restoredStock = product.stock_quantity + item.quantity;
    await Product.findByIdAndUpdate(product._id, {
      stock_quantity: restoredStock,
      status: 'active',
      updated_at: new Date(),
    });
    if (restoredStock >= product.min_stock_threshold) {
      await RestockQueue.deleteOne({ product_id: product._id });
    }
  }

  await logActivity(`Order #${id} cancelled`);

  res.json({ message: 'Order cancelled successfully' });
});

export default router;
