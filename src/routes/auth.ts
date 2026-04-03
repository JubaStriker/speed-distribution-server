import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ServiceError } from '../services/errors';
import * as authService from '../services/auth.service';

const router = Router();

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  role: z.enum(['admin', 'manager']).optional().default('manager'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/auth/signup
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  try {
    const result = await authService.signup(parsed.data);
    res.status(201).json({ data: result });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.issues.map((e) => e.message) });
    return;
  }

  try {
    const result = await authService.login(parsed.data.email, parsed.data.password);
    res.json({ data: result });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await authService.getMe(req.user!.userId);
    res.json({ data: user });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      throw err;
    }
  }
});

export default router;
