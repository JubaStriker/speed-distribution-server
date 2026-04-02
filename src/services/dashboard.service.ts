import Order from '../models/Order';
import RestockQueue from '../models/RestockQueue';

export async function getDashboardData() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    totalOrdersToday,
    pendingOrders,
    completedOrders,
    lowStockCount,
    revenueTodayResult,
    lowStockProducts,
    ordersByStatusRows,
    revenueLast7DaysRows,
  ] = await Promise.all([
    Order.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } }),
    Order.countDocuments({ status: 'pending' }),
    Order.countDocuments({ status: 'delivered' }),
    RestockQueue.countDocuments(),
    Order.aggregate([
      {
        $match: {
          created_at: { $gte: todayStart, $lte: todayEnd },
          status: { $ne: 'cancelled' },
        },
      },
      { $group: { _id: null, revenue: { $sum: '$total_price' } } },
    ]),
    RestockQueue.find()
      .populate('product_id', 'name stock_quantity status min_stock_threshold')
      .then((items) =>
        items
          .filter((qi) => qi.product_id)
          .map((qi) => {
            const p = qi.product_id as unknown as Record<string, unknown>;
            return {
              name: p.name,
              stock_quantity: p.stock_quantity,
              status: p.status,
              min_stock_threshold: p.min_stock_threshold,
            };
          })
          .sort((a, b) => (a.stock_quantity as number) - (b.stock_quantity as number))
      ),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([
      {
        $match: {
          created_at: { $gte: new Date(Date.now() - 6 * 86400000) },
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          revenue: { $sum: '$total_price' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const revenueToday = revenueTodayResult[0]?.revenue ?? 0;

  const ordersByStatus: Record<string, number> = {
    pending: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };
  for (const row of ordersByStatusRows) {
    ordersByStatus[row._id as string] = row.count as number;
  }

  const revenueMap = new Map<string, number>(
    revenueLast7DaysRows.map((r) => [r._id as string, r.revenue as number])
  );
  const last7Days: { date: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last7Days.push({ date: dateStr, revenue: revenueMap.get(dateStr) ?? 0 });
  }

  return {
    total_orders_today: totalOrdersToday,
    pending_orders: pendingOrders,
    completed_orders: completedOrders,
    low_stock_count: lowStockCount,
    revenue_today: revenueToday,
    low_stock_products: lowStockProducts,
    orders_by_status: ordersByStatus,
    revenue_last_7_days: last7Days,
  };
}
