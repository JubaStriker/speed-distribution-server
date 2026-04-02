import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/speed-distribution';

export const connectDB = async (): Promise<void> => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');
};

export default mongoose;
