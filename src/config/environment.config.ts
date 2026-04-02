import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/sky-distribution',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  passwordSecretKey: process.env.PASSWORD_SECRET_KEY,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d'
};
