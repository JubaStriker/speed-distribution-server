import { Router, Response } from 'express';
import db from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest, Product } from '../types';

const router = Router();
router.use(authMiddleware);

// GET /api/dashboard
router.get('/', (_req: AuthRequest, res: Response): void => {
  // Total orders today
  const totalOrdersToday = (db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE DATE(created_at) = DATE('now')
  `).get() as { count: number }).count;

  // Pending orders
  const pendingOrders = (db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE status = 'pending'
  `).get() as { count: number }).count;

  // Completed orders (delivered)
  const completedOrders = (db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE status = 'delivered'
  `).get() as { count: number }).count;

  // Low stock count (products in restock queue)
  const lowStockCount = (db.prepare(`
    SELECT COUNT(*) as count FROM restock_queue
  `).get() as { count: number }).count;

  // Revenue today (from non-cancelled orders)
  const revenueToday = (db.prepare(`
    SELECT COALESCE(SUM(total_price), 0) as revenue
    FROM orders
    WHERE DATE(created_at) = DATE('now')
      AND status != 'cancelled'
  `).get() as { revenue: number }).revenue;

  // Low stock products
  const lowStockProducts = db.prepare(`
    SELECT p.name, p.stock_quantity, p.status, p.min_stock_threshold
    FROM products p
    JOIN restock_queue rq ON p.id = rq.product_id
    ORDER BY p.stock_quantity ASC
  `).all() as Pick<Product, 'name' | 'stock_quantity' | 'status' | 'min_stock_threshold'>[];

  // Orders by status
  const ordersByStatusRows = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM orders
    GROUP BY status
  `).all() as { status: string; count: number }[];

  const ordersByStatus: Record<string, number> = {
    pending: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };
  for (const row of ordersByStatusRows) {
    ordersByStatus[row.status] = row.count;
  }

  // Revenue last 7 days
  const revenueLast7Days = db.prepare(`
    SELECT
      DATE(created_at) as date,
      COALESCE(SUM(total_price), 0) as revenue
    FROM orders
    WHERE created_at >= DATE('now', '-6 days')
      AND status != 'cancelled'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all() as { date: string; revenue: number }[];

  // Fill in missing days with 0 revenue
  const last7Days: { date: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const existing = revenueLast7Days.find((r) => r.date === dateStr);
    last7Days.push({ date: dateStr, revenue: existing ? existing.revenue : 0 });
  }

  res.json({
    data: {
      total_orders_today: totalOrdersToday,
      pending_orders: pendingOrders,
      completed_orders: completedOrders,
      low_stock_count: lowStockCount,
      revenue_today: revenueToday,
      low_stock_products: lowStockProducts,
      orders_by_status: ordersByStatus,
      revenue_last_7_days: last7Days,
    },
  });
});

export default router;
