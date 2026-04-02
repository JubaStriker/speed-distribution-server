import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Category from '../models/Category';
import RestockQueue from '../models/RestockQueue';
import Order from '../models/Order';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';

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
  const { q, category_id, status, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q) filter.name = { $regex: q as string, $options: 'i' };
  if (category_id && mongoose.Types.ObjectId.isValid(category_id as string)) {
    filter.category_id = category_id;
  }
  if (status) filter.status = status;

  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .populate('category_id', 'name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum),
  ]);

  const data = products.map((p) => {
    const obj = p.toJSON() as Record<string, unknown>;
    const cat = obj.category_id as Record<string, unknown> | null;
    obj.category_name = cat ? cat.name : null;
    obj.category_id = cat ? cat.id : null;
    return obj;
  });

  res.json({
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.ceil(total / limitNum),
    },
  });
});

// POST /api/products
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const { name, category_id, price, stock_quantity, min_stock_threshold } = parsed.data;

  if (!mongoose.Types.ObjectId.isValid(category_id)) {
    res.status(400).json({ error: 'Invalid category ID' });
    return;
  }

  const category = await Category.findById(category_id);
  if (!category) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  const status = stock_quantity === 0 ? 'out_of_stock' : 'active';

  const product = await Product.create({
    name, category_id, price, stock_quantity, min_stock_threshold, status,
  });

  if (stock_quantity < min_stock_threshold) {
    await RestockQueue.findOneAndUpdate(
      { product_id: product._id },
      { product_id: product._id },
      { upsert: true }
    );
  }

  const populated = await product.populate('category_id', 'name');
  const obj = populated.toJSON() as Record<string, unknown>;
  const cat = obj.category_id as Record<string, unknown> | null;
  obj.category_name = cat ? cat.name : null;
  obj.category_id = cat ? cat.id : null;

  res.status(201).json({ data: obj });
});

// PUT /api/products/:id
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid product ID' });
    return;
  }

  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const existing = await Product.findById(id);
  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  if (parsed.data.category_id) {
    if (!mongoose.Types.ObjectId.isValid(parsed.data.category_id)) {
      res.status(400).json({ error: 'Invalid category ID' });
      return;
    }
    const category = await Category.findById(parsed.data.category_id);
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
  }

  const updates = parsed.data;
  const newStock = updates.stock_quantity !== undefined ? updates.stock_quantity : existing.stock_quantity;
  const newThreshold = updates.min_stock_threshold !== undefined ? updates.min_stock_threshold : existing.min_stock_threshold;

  let newStatus = updates.status !== undefined ? updates.status : existing.status;
  if (updates.stock_quantity !== undefined) {
    if (newStock === 0) {
      newStatus = 'out_of_stock';
    } else if (newStock > 0 && existing.status === 'out_of_stock' && updates.status === undefined) {
      newStatus = 'active';
    }
  }

  await Product.findByIdAndUpdate(id, {
    name: updates.name ?? existing.name,
    category_id: updates.category_id ?? existing.category_id,
    price: updates.price ?? existing.price,
    stock_quantity: newStock,
    min_stock_threshold: newThreshold,
    status: newStatus,
    updated_at: new Date(),
  });

  if (newStock < newThreshold) {
    await RestockQueue.findOneAndUpdate(
      { product_id: id },
      { product_id: id },
      { upsert: true }
    );
  } else {
    await RestockQueue.deleteOne({ product_id: id });
  }

  const product = await Product.findById(id).populate('category_id', 'name');
  const obj = product!.toJSON() as Record<string, unknown>;
  const cat = obj.category_id as Record<string, unknown> | null;
  obj.category_name = cat ? cat.name : null;
  obj.category_id = cat ? cat.id : null;

  res.json({ data: obj });
});

// DELETE /api/products/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid product ID' });
    return;
  }

  const product = await Product.findById(id);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const orderCount = await Order.countDocuments({ 'items.product_id': id });
  if (orderCount > 0) {
    res.status(409).json({ error: 'Cannot delete product that has associated orders' });
    return;
  }

  await RestockQueue.deleteOne({ product_id: id });
  await Product.findByIdAndDelete(id);

  res.json({ message: 'Product deleted successfully' });
});

export default router;
