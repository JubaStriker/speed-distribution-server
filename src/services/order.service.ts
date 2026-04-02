import mongoose from 'mongoose';
import Order from '../models/Order';
import Product from '../models/Product';
import RestockQueue from '../models/RestockQueue';
import ActivityLog from '../models/ActivityLog';
import { ServiceError } from './errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function flattenOrderItems(order: any) {
  const obj = order.toJSON ? order.toJSON() : order;
  if (Array.isArray(obj.items)) {
    obj.items = obj.items.map((item: Record<string, unknown>) => {
      const prod = item.product_id as Record<string, unknown> | null;
      if (prod && typeof prod === 'object' && 'name' in prod) {
        return {
          ...item,
          product_name: prod.name,
          product_status: (prod as Record<string, unknown>).status ?? undefined,
          product_id: prod.id ?? prod._id?.toString(),
        };
      }
      return item;
    });
  }
  return obj;
}

async function logActivity(message: string): Promise<void> {
  await ActivityLog.create({ message });
}

export async function getOrders(query: {
  status?: string;
  date?: string;
  page?: string;
  limit?: string;
}) {
  const { status, date, page = '1', limit = '20' } = query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
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

  return {
    data: orders,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.ceil(total / limitNum),
    },
  };
}

export async function createOrder(data: {
  customer_name: string;
  items: { product_id: string; quantity: number }[];
}) {
  const { customer_name, items } = data;

  const productIds = items.map((i) => i.product_id);
  if (new Set(productIds).size !== productIds.length) {
    throw new ServiceError(409, 'This product is already added to the order.');
  }

  for (const item of items) {
    if (!mongoose.Types.ObjectId.isValid(item.product_id)) {
      throw new ServiceError(400, `Invalid product ID: ${item.product_id}`);
    }
  }

  const productDocs = [];
  for (const item of items) {
    const product = await Product.findById(item.product_id);
    if (!product) throw new ServiceError(404, `Product with ID ${item.product_id} not found`);
    if (product.status !== 'active') throw new ServiceError(409, 'This product is currently unavailable.');
    if (product.stock_quantity < item.quantity) {
      throw new ServiceError(400, `Only ${product.stock_quantity} items available in stock`);
    }
    productDocs.push({ product, quantity: item.quantity });
  }

  let total_price = 0;
  const orderItems = productDocs.map(({ product, quantity }) => {
    total_price += product.price * quantity;
    return { product_id: product._id, quantity, unit_price: product.price };
  });

  const order = await Order.create({ customer_name, total_price, items: orderItems });

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

  const populated = await Order.findById(order._id).populate('items.product_id', 'name');
  return flattenOrderItems(populated);
}

export async function getOrder(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ServiceError(400, 'Invalid order ID');
  }

  const order = await Order.findById(id).populate('items.product_id', 'name status');
  if (!order) throw new ServiceError(404, 'Order not found');

  return flattenOrderItems(order);
}

export async function updateOrderStatus(id: string, status: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ServiceError(400, 'Invalid order ID');
  }

  const order = await Order.findById(id);
  if (!order) throw new ServiceError(404, 'Order not found');

  if (order.status === 'cancelled') {
    throw new ServiceError(409, 'Cannot update status of a cancelled order');
  }
  if (order.status === status) {
    throw new ServiceError(409, `Order is already in '${status}' status`);
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
  return flattenOrderItems(updatedOrder);
}

export async function cancelOrder(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ServiceError(400, 'Invalid order ID');
  }

  const order = await Order.findById(id);
  if (!order) throw new ServiceError(404, 'Order not found');

  if (order.status === 'cancelled') {
    throw new ServiceError(409, 'Order is already cancelled');
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
}
