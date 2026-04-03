import Order from '../models/Order';
import RestockQueue from '../models/RestockQueue';

export async function getAnalyticsData() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    totalOrdersToday,
    pendingOrdersToday,
    lowStockCount,
    revenueTodayResult,
    ordersByStatusRows,
    latestOrders,
  ] = await Promise.all([
    Order.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } }),

    Order.countDocuments({
      status: 'pending',
      created_at: { $gte: todayStart, $lte: todayEnd },
    }),

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

    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

    Order.find()
      .sort({ created_at: -1 })
      .limit(5)
      .populate('items.product_id', 'name'),
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

  return {
    total_orders_today: totalOrdersToday,
    pending_orders_today: pendingOrdersToday,
    low_stock_count: lowStockCount,
    revenue_today: revenueToday,
    orders_by_status: ordersByStatus,
    latest_orders: latestOrders.map((o) => o.toJSON()),
  };
}
