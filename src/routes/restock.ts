import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import Product from '../models/Product';
import RestockQueue from '../models/RestockQueue';
import ActivityLog from '../models/ActivityLog';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();
router.use(authMiddleware);

const restockSchema = z.object({
  quantity_to_add: z.number().int().positive('Quantity to add must be a positive integer'),
});

type Priority = 'High' | 'Medium' | 'Low';

function getPriority(stock: number, threshold: number): Priority {
  if (stock === 0) return 'High';
  if (stock <= Math.floor(threshold / 2)) return 'Medium';
  return 'Low';
}

// GET /api/restock
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  const queueItems = await RestockQueue.find().populate({
    path: 'product_id',
    populate: { path: 'category_id', select: 'name' },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = queueItems.map((qi) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = qi.product_id as any;
    if (!p) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cat = p.category_id as any;
    return {
      id: qi._id.toString(),
      product_id: p._id?.toString(),
      added_at: qi.added_at,
      name: p.name,
      stock_quantity: p.stock_quantity,
      min_stock_threshold: p.min_stock_threshold,
      status: p.status,
      category_name: cat ? cat.name : null,
      priority: getPriority(p.stock_quantity as number, p.min_stock_threshold as number),
    };
  }).filter(Boolean);

  // Sort by stock_quantity ascending
  data.sort((a, b) => (a!.stock_quantity as number) - (b!.stock_quantity as number));

  res.json({ data });
});

// PUT /api/restock/:product_id/restock
router.put('/:product_id/restock', async (req: AuthRequest, res: Response): Promise<void> => {
  const product_id = String(req.params['product_id']);
  if (!mongoose.Types.ObjectId.isValid(product_id)) {
    res.status(400).json({ error: 'Invalid product ID' });
    return;
  }

  const parsed = restockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  const { quantity_to_add } = parsed.data;

  const product = await Product.findById(product_id);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const newStock = product.stock_quantity + quantity_to_add;
  const newStatus = newStock > 0 ? 'active' : 'out_of_stock';

  await Product.findByIdAndUpdate(product_id, {
    stock_quantity: newStock,
    status: newStatus,
    updated_at: new Date(),
  });

  if (newStock >= product.min_stock_threshold) {
    await RestockQueue.deleteOne({ product_id: new mongoose.Types.ObjectId(product_id) });
  }

  await ActivityLog.create({
    message: `${product.name} restocked: +${quantity_to_add} units (total: ${newStock})`,
  });

  const updatedProduct = await Product.findById(product_id).populate('category_id', 'name');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = updatedProduct!.toJSON() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cat = obj.category_id as any;
  if (cat && typeof cat === 'object' && 'name' in cat) {
    obj.category_name = cat.name;
    obj.category_id = cat.id ?? cat._id?.toString();
  } else {
    obj.category_name = null;
  }

  const inQueue = await RestockQueue.findOne({ product_id: new mongoose.Types.ObjectId(product_id) });

  res.json({
    data: {
      product: obj,
      quantity_added: quantity_to_add,
      new_stock: newStock,
      removed_from_queue: !inQueue,
    },
  });
});

export default router;
