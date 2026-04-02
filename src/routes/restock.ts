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
  const queueItems = await RestockQueue.find()
    .populate({
      path: 'product_id',
      populate: { path: 'category_id', select: 'name' },
    })
    .sort({ 'product_id.stock_quantity': 1 });

  const data = queueItems
    .filter((qi) => qi.product_id) // guard against orphaned refs
    .map((qi) => {
      const p = qi.product_id as unknown as Record<string, unknown> & {
        stock_quantity: number;
        min_stock_threshold: number;
      };
      const cat = p.category_id as Record<string, unknown> | null;
      return {
        id: (qi._id as mongoose.Types.ObjectId).toString(),
        product_id: (p as unknown as mongoose.Document)._id?.toString(),
        added_at: qi.added_at,
        name: p.name,
        stock_quantity: p.stock_quantity,
        min_stock_threshold: p.min_stock_threshold,
        status: p.status,
        category_name: cat ? cat.name : null,
        priority: getPriority(p.stock_quantity, p.min_stock_threshold),
      };
    });

  res.json({ data });
});

// PUT /api/restock/:product_id/restock
router.put('/:product_id/restock', async (req: AuthRequest, res: Response): Promise<void> => {
  const { product_id } = req.params;
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
    await RestockQueue.deleteOne({ product_id });
  }

  await ActivityLog.create({
    message: `${product.name} restocked: +${quantity_to_add} units (total: ${newStock})`,
  });

  const updatedProduct = await Product.findById(product_id).populate('category_id', 'name');
  const obj = updatedProduct!.toJSON() as Record<string, unknown>;
  const cat = obj.category_id as Record<string, unknown> | null;
  obj.category_name = cat ? cat.name : null;
  obj.category_id = cat ? cat.id : null;

  const inQueue = await RestockQueue.findOne({ product_id });

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
