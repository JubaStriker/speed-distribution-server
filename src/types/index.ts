import { Request } from 'express';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'manager';
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  category_id: number;
  price: number;
  stock_quantity: number;
  min_stock_threshold: number;
  status: 'active' | 'out_of_stock';
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  customer_name: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  total_price: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
}

export interface RestockQueue {
  id: number;
  product_id: number;
  added_at: string;
}

export interface ActivityLog {
  id: number;
  message: string;
  created_at: string;
}

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}
