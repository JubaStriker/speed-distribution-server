import mongoose from 'mongoose';
import Product from '../models/Product';
import Category from '../models/Category';
import RestockQueue from '../models/RestockQueue';
import Order from '../models/Order';
import { ServiceError } from './errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toProductJSON(p: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return p.toJSON() as any;
}

export async function getProducts(query: {
  q?: string;
  category_id?: string;
  status?: string;
  page?: string;
  limit?: string;
}) {
  const { q, category_id, status, page = '1', limit = '20' } = query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q) filter.name = { $regex: q, $options: 'i' };
  if (category_id && mongoose.Types.ObjectId.isValid(category_id)) {
    filter.category_id = new mongoose.Types.ObjectId(category_id);
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

  return {
    data: products.map(toProductJSON),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.ceil(total / limitNum),
    },
  };
}

export async function createProduct(data: {
  name: string;
  category_id: string;
  price: number;
  stock_quantity: number;
  min_stock_threshold: number;
}) {
  const { name, category_id, price, stock_quantity, min_stock_threshold } = data;

  if (!mongoose.Types.ObjectId.isValid(category_id)) {
    throw new ServiceError(400, 'Invalid category ID');
  }

  const category = await Category.findById(category_id).lean();
  if (!category) throw new ServiceError(404, 'Category not found');

  const status = stock_quantity === 0 ? 'out_of_stock' : 'active';

  const product = await Product.create({
    name, category_id, category_name: category.name, price, stock_quantity, min_stock_threshold, status,
  });

  if (stock_quantity < min_stock_threshold) {
    await RestockQueue.findOneAndUpdate(
      { product_id: product._id },
      { product_id: product._id },
      { upsert: true }
    );
  }

  const populated = await product.populate('category_id', 'name');
  return toProductJSON(populated);
}

export async function updateProduct(
  id: string,
  updates: {
    name?: string;
    category_id?: string;
    price?: number;
    stock_quantity?: number;
    min_stock_threshold?: number;
    status?: 'active' | 'out_of_stock';
  }
) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ServiceError(400, 'Invalid product ID');
  }

  const existing = await Product.findById(id);
  if (!existing) throw new ServiceError(404, 'Product not found');

  let resolvedCategoryName: string | undefined;
  if (updates.category_id) {
    if (!mongoose.Types.ObjectId.isValid(updates.category_id)) {
      throw new ServiceError(400, 'Invalid category ID');
    }
    const category = await Category.findById(updates.category_id);
    if (!category) throw new ServiceError(404, 'Category not found');
    resolvedCategoryName = category.name;
  }

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
    category_name: resolvedCategoryName ?? existing.category_name,
    price: updates.price ?? existing.price,
    stock_quantity: newStock,
    min_stock_threshold: newThreshold,
    status: newStatus,
    updated_at: new Date(),
  });

  if (newStock < newThreshold) {
    await RestockQueue.findOneAndUpdate(
      { product_id: new mongoose.Types.ObjectId(id) },
      { product_id: new mongoose.Types.ObjectId(id) },
      { upsert: true }
    );
  } else {
    await RestockQueue.deleteOne({ product_id: new mongoose.Types.ObjectId(id) });
  }

  const product = await Product.findById(id).populate('category_id', 'name');
  return toProductJSON(product);
}

export async function deleteProduct(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ServiceError(400, 'Invalid product ID');
  }

  const product = await Product.findById(id);
  if (!product) throw new ServiceError(404, 'Product not found');

  const orderCount = await Order.countDocuments({ 'items.product_id': new mongoose.Types.ObjectId(id) });
  if (orderCount > 0) {
    throw new ServiceError(409, 'Cannot delete product that has associated orders');
  }

  await RestockQueue.deleteOne({ product_id: new mongoose.Types.ObjectId(id) });
  await Product.findByIdAndDelete(id);
}
