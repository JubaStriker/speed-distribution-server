import mongoose from 'mongoose';
import Product from '../models/Product';
import RestockQueue from '../models/RestockQueue';
import ActivityLog from '../models/ActivityLog';
import { ServiceError } from './errors';
import { toProductJSON } from './product.service';

type Priority = 'High' | 'Medium' | 'Low';

function getPriority(stock: number, threshold: number): Priority {
  if (stock === 0) return 'High';
  if (stock <= Math.floor(threshold / 2)) return 'Medium';
  return 'Low';
}

export async function getRestockQueue() {
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
      restock_status: qi.restock_status,
    };
  }).filter(Boolean);

  data.sort((a, b) => (a!.stock_quantity as number) - (b!.stock_quantity as number));

  return data;
}

export async function updateRestockStatus(id: string, restock_status: 'pending' | 'completed') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ServiceError(400, 'Invalid restock queue ID');
  }

  const item = await RestockQueue.findByIdAndUpdate(
    id,
    { restock_status },
    { new: true }
  );

  if (!item) throw new ServiceError(404, 'Restock queue item not found');

  return { id: item._id.toString(), restock_status: item.restock_status };
}

export async function restockProduct(product_id: string, quantity_to_add: number) {
  if (!mongoose.Types.ObjectId.isValid(product_id)) {
    throw new ServiceError(400, 'Invalid product ID');
  }

  const product = await Product.findById(product_id);
  if (!product) throw new ServiceError(404, 'Product not found');

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
  const obj = toProductJSON(updatedProduct!);

  const inQueue = await RestockQueue.findOne({ product_id: new mongoose.Types.ObjectId(product_id) });

  return {
    product: obj,
    quantity_added: quantity_to_add,
    new_stock: newStock,
    removed_from_queue: !inQueue,
  };
}
