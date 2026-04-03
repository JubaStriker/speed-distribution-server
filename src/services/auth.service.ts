import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { getId } from '../utils/idGenerator';
import { decryptData } from '../utils/hash';
import { ServiceError } from './errors';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-speed-distribution-2024';

export async function signup(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager';
}) {
  const { email, password, firstName, lastName, role } = data;

  const existing = await User.findOne({ email });
  if (existing) throw new ServiceError(409, 'Email already registered');

  const decryptedPassword = decryptData(password);
  const password_hash = await bcrypt.hash(decryptedPassword, 10);
  const userId = getId('USR');

  const user = await User.create({ userId, email, password_hash, firstName, lastName, role });

  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { password_hash: _, ...userJSON } = user.toJSON() as any;
  return { user: userJSON, token };
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email });
  if (!user) throw new ServiceError(401, 'Invalid email or password');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new ServiceError(401, 'Invalid email or password');

  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { password_hash: _, ...userJSON } = user.toJSON() as any;
  return { user: userJSON, token };
}

export async function getMe(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new ServiceError(404, 'User not found');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { password_hash: _, ...userJSON } = user.toJSON() as any;
  return userJSON;
}
