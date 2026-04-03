import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB } from './database';
import User from '../models/User';
import Category from '../models/Category';
import Product from '../models/Product';
import Order from '../models/Order';
import RestockQueue from '../models/RestockQueue';
import ActivityLog from '../models/ActivityLog';

const seed = async () => {
  await connectDB();
  console.log('Seeding database...');

  // Clear existing data
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    RestockQueue.deleteMany({}),
    ActivityLog.deleteMany({}),
  ]);

  // ── Users ────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('demo123', 10);
  await User.create({ userId: 'seed-admin-001', email: 'demo@example.com', password_hash: passwordHash, firstName: 'Demo', lastName: 'User', role: 'admin' });
  console.log('Users seeded.');

  // ── Categories ───────────────────────────────────────────────────────────
  const [electronics, clothing, grocery] = await Category.insertMany([
    { name: 'Electronics' },
    { name: 'Clothing' },
    { name: 'Grocery' },
  ]);
  console.log('Categories seeded.');

  // ── Products ─────────────────────────────────────────────────────────────
  const [iphone, tshirt, headphones, rice, laptop] = await Product.insertMany([
    { name: 'iPhone 13',  category_id: electronics._id, price: 999,  stock_quantity: 3,  min_stock_threshold: 5,  status: 'active' },
    { name: 'T-Shirt',    category_id: clothing._id,    price: 25,   stock_quantity: 20, min_stock_threshold: 5,  status: 'active' },
    { name: 'Headphones', category_id: electronics._id, price: 150,  stock_quantity: 8,  min_stock_threshold: 5,  status: 'active' },
    { name: 'Rice 5kg',   category_id: grocery._id,     price: 15,   stock_quantity: 2,  min_stock_threshold: 10, status: 'active' },
    { name: 'Laptop',     category_id: electronics._id, price: 1200, stock_quantity: 15, min_stock_threshold: 3,  status: 'active' },
  ]);
  console.log('Products seeded.');

  // ── Restock queue (low-stock products) ───────────────────────────────────
  await RestockQueue.insertMany([
    { product_id: iphone._id },   // stock 3 < threshold 5
    { product_id: rice._id },     // stock 2 < threshold 10
  ]);
  console.log('Restock queue seeded.');

  // ── Orders ───────────────────────────────────────────────────────────────
  const now = new Date();
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000);

  const order1 = await Order.create({
    customer_name: 'Alice Johnson',
    status: 'delivered',
    total_price: 1149.00,
    items: [
      { product_id: headphones._id, quantity: 1, unit_price: 150 },
      { product_id: iphone._id,     quantity: 1, unit_price: 999 },
    ],
    created_at: twoDaysAgo,
    updated_at: twoDaysAgo,
  });

  const order2 = await Order.create({
    customer_name: 'Bob Smith',
    status: 'pending',
    total_price: 50.00,
    items: [{ product_id: tshirt._id, quantity: 2, unit_price: 25 }],
    created_at: now,
    updated_at: now,
  });

  const order3 = await Order.create({
    customer_name: 'Carol White',
    status: 'confirmed',
    total_price: 2400.00,
    items: [{ product_id: laptop._id, quantity: 2, unit_price: 1200 }],
    created_at: now,
    updated_at: now,
  });
  console.log('Orders seeded.');

  // ── Activity log ─────────────────────────────────────────────────────────
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
  const yesterday = new Date(Date.now() - 86400000);

  await ActivityLog.insertMany([
    { message: 'iPhone 13 added to restock queue',                      created_at: threeDaysAgo },
    { message: 'Rice 5kg added to restock queue',                       created_at: threeDaysAgo },
    { message: `Order #${order1._id} created for Alice Johnson`,        created_at: twoDaysAgo },
    { message: `Order #${order1._id} marked as delivered`,              created_at: yesterday },
    { message: `Order #${order2._id} created for Bob Smith`,            created_at: now },
    { message: `Order #${order3._id} created for Carol White`,          created_at: now },
  ]);
  console.log('Activity log seeded.');

  console.log('\nDatabase seeded successfully!');
  console.log('Demo credentials: demo@example.com / demo123');
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
