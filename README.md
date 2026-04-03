# Speed Distribution Server

REST API backend for the Speed Distribution inventory and order management system.

**Live Site:** [https://speed-distribution-client.vercel.app](https://speed-distribution-client.vercel.app)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Express.js v5 |
| Database | MongoDB (via Mongoose) |
| Authentication | JSON Web Tokens (JWT) |
| Password Hashing | bcryptjs |
| Validation | Zod |
| Security | Helmet, CORS |
| Deployment | Vercel (Serverless) |

---

## Features

- **Authentication** — JWT-based login and signup with role-based access (`admin`, `manager`)
- **Products** — Full CRUD with search, category filter, status filter, and pagination
- **Categories** — Create, list, and delete product categories
- **Orders** — Create orders, track status lifecycle (`pending → confirmed → shipped → delivered → cancelled`), paginated listing with date and status filters
- **Restock Queue** — Automatic low-stock detection, restock queue management, and stock replenishment
- **Dashboard** — Today's revenue, order counts, orders by status, 7-day revenue trend, and low-stock alerts
- **Analytics** — Daily order totals, pending orders, revenue, order status breakdown, and latest 5 orders
- **Activity Log** — Paginated audit trail of user actions, filterable by user and HTTP method

---

## Project Structure

```
src/
├── db/
│   ├── database.ts       # MongoDB connection
│   └── seed.ts           # Database seeder
├── middleware/
│   ├── auth.ts           # JWT auth middleware
│   └── errorHandler.ts   # Global error handler
├── models/
│   ├── ActivityLog.ts
│   ├── Category.ts
│   ├── Order.ts
│   ├── Product.ts
│   ├── RestockQueue.ts
│   └── User.ts
├── routes/
│   ├── activityLog.ts
│   ├── analytics.ts
│   ├── auth.ts
│   ├── categories.ts
│   ├── dashboard.ts
│   ├── orders.ts
│   ├── products.ts
│   └── restock.ts
├── services/             # Business logic layer
└── index.ts              # App entry point
```

---

## API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Register a new user |
| POST | `/api/auth/login` | No | Login and receive JWT |
| GET | `/api/auth/me` | Yes | Get current user profile |

### Categories
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/categories` | Yes | List all categories |
| POST | `/api/categories` | Yes | Create a category |
| DELETE | `/api/categories/:id` | Yes | Delete a category |

### Products
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/products` | Yes | List products (search, filter, paginate) |
| POST | `/api/products` | Yes | Create a product |
| PUT | `/api/products/:id` | Yes | Update a product |
| DELETE | `/api/products/:id` | Yes | Delete a product |

### Orders
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/orders` | Yes | List orders (filter by status/date, paginate) |
| POST | `/api/orders` | Yes | Create an order |
| GET | `/api/orders/:id` | Yes | Get a single order |
| PUT | `/api/orders/:id/status` | Yes | Update order status |
| DELETE | `/api/orders/:id` | Yes | Cancel an order |

### Restock
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/restock` | Yes | Get restock queue |
| PATCH | `/api/restock/:id/status` | Yes | Update restock item status |
| PUT | `/api/restock/:product_id/restock` | Yes | Restock a product |

### Dashboard & Analytics
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/dashboard` | Yes | KPIs, revenue trend, order breakdown |
| GET | `/api/analytics` | Yes | Daily analytics summary |
| GET | `/api/activity-log` | Yes | Paginated activity log |

---

## Local Setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB)

### Installation

```bash
git clone https://github.com/JubaStriker/speed-distribution-server.git
cd speed-distribution-server
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```env
PORT=3001
NODE_ENV=development
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/speed-distribution?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key
PASSWORD_SECRET_KEY=your-encryption-key
CORS_ORIGIN=http://localhost:5173
```

### Running

```bash
# Development (hot reload)
npm run dev

# Build
npm run build

# Production
npm start

# Seed database
npm run seed
```

---

## Deployment (Vercel)

The project includes a `vercel.json` that routes all requests to the Express app via `@vercel/node`.

Set the following environment variables in the Vercel dashboard:

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for signing JWTs |
| `PASSWORD_SECRET_KEY` | Encryption key for passwords |
| `CORS_ORIGIN` | Frontend URL (e.g. `https://speed-distribution-client.vercel.app`) |
| `NODE_ENV` | Set to `production` |
