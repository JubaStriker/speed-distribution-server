import bcrypt from 'bcryptjs';
import db from './database';

const seed = async () => {
  console.log('Seeding database...');

  // Clear existing data in dependency order
  db.exec(`
    DELETE FROM activity_log;
    DELETE FROM restock_queue;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM products;
    DELETE FROM categories;
    DELETE FROM users;
  `);

  // Seed users
  const passwordHash = await bcrypt.hash('demo123', 10);
  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, name, role)
    VALUES (?, ?, ?, ?)
  `);
  insertUser.run('demo@example.com', passwordHash, 'Demo User', 'admin');
  console.log('Users seeded.');

  // Seed categories
  const insertCategory = db.prepare(`
    INSERT INTO categories (name) VALUES (?)
  `);
  const electronicsResult = insertCategory.run('Electronics');
  const clothingResult = insertCategory.run('Clothing');
  const groceryResult = insertCategory.run('Grocery');

  const electronicsId = electronicsResult.lastInsertRowid as number;
  const clothingId = clothingResult.lastInsertRowid as number;
  const groceryId = groceryResult.lastInsertRowid as number;

  console.log('Categories seeded.');

  // Seed products
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category_id, price, stock_quantity, min_stock_threshold, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const iphone = insertProduct.run('iPhone 13', electronicsId, 999, 3, 5, 'active');
  insertProduct.run('T-Shirt', clothingId, 25, 20, 5, 'active');
  const headphones = insertProduct.run('Headphones', electronicsId, 150, 8, 5, 'active');
  const rice = insertProduct.run('Rice 5kg', groceryId, 15, 2, 10, 'active');
  insertProduct.run('Laptop', electronicsId, 1200, 15, 3, 'active');

  console.log('Products seeded.');

  // Add low-stock products to restock queue
  const insertRestock = db.prepare(`
    INSERT OR IGNORE INTO restock_queue (product_id) VALUES (?)
  `);
  insertRestock.run(iphone.lastInsertRowid); // iPhone 13: stock 3, threshold 5
  insertRestock.run(rice.lastInsertRowid);   // Rice 5kg: stock 2, threshold 10

  console.log('Restock queue seeded.');

  // Seed some sample orders
  const insertOrder = db.prepare(`
    INSERT INTO orders (customer_name, status, total_price, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now', '-2 days'), datetime('now', '-2 days'))
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    VALUES (?, ?, ?, ?)
  `);

  // Order 1: delivered
  const order1 = insertOrder.run('Alice Johnson', 'delivered', 1149.00);
  const order1Id = order1.lastInsertRowid as number;
  insertOrderItem.run(order1Id, headphones.lastInsertRowid, 1, 150);
  insertOrderItem.run(order1Id, iphone.lastInsertRowid, 1, 999);

  // Order 2: pending
  const order2 = db.prepare(`
    INSERT INTO orders (customer_name, status, total_price, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).run('Bob Smith', 'pending', 50.00);
  const order2Id = order2.lastInsertRowid as number;
  insertOrderItem.run(order2Id, db.prepare('SELECT id FROM products WHERE name = ?').get('T-Shirt') as { id: number }, 2, 25);

  // Fix order2 item insertion - use T-Shirt id directly
  const tshirt = db.prepare('SELECT id FROM products WHERE name = ?').get('T-Shirt') as { id: number };
  // Remove bad insert and redo correctly
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(order2Id);
  insertOrderItem.run(order2Id, tshirt.id, 2, 25);

  // Order 3: confirmed (today)
  const order3 = db.prepare(`
    INSERT INTO orders (customer_name, status, total_price, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).run('Carol White', 'confirmed', 2400.00);
  const order3Id = order3.lastInsertRowid as number;
  const laptop = db.prepare('SELECT id FROM products WHERE name = ?').get('Laptop') as { id: number };
  insertOrderItem.run(order3Id, laptop.id, 2, 1200);

  console.log('Orders seeded.');

  // Seed activity log
  const insertLog = db.prepare(`
    INSERT INTO activity_log (message, created_at) VALUES (?, ?)
  `);
  insertLog.run(`Order #${order1Id} created for Alice Johnson`, "datetime('now', '-2 days')");
  insertLog.run(`Order #${order1Id} marked as delivered`, "datetime('now', '-1 day')");
  insertLog.run(`Order #${order2Id} created for Bob Smith`, "datetime('now')");
  insertLog.run(`Order #${order3Id} created for Carol White`, "datetime('now')");
  insertLog.run('iPhone 13 added to restock queue', "datetime('now', '-3 days')");
  insertLog.run('Rice 5kg added to restock queue', "datetime('now', '-3 days')");

  // Fix activity log with real datetime
  db.exec('DELETE FROM activity_log');
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

  const insertLogFixed = db.prepare('INSERT INTO activity_log (message, created_at) VALUES (?, ?)');
  insertLogFixed.run(`Order #${order1Id} created for Alice Johnson`, twoDaysAgo);
  insertLogFixed.run(`Order #${order1Id} marked as delivered`, yesterday);
  insertLogFixed.run(`Order #${order2Id} created for Bob Smith`, now);
  insertLogFixed.run(`Order #${order3Id} created for Carol White`, now);
  insertLogFixed.run('iPhone 13 added to restock queue', threeDaysAgo);
  insertLogFixed.run('Rice 5kg added to restock queue', threeDaysAgo);

  console.log('Activity log seeded.');
  console.log('Database seeded successfully!');
  console.log('Demo credentials: demo@example.com / demo123');

  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
