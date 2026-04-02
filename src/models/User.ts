import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password_hash: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager';
  created_at: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    role: { type: String, enum: ['admin', 'manager'], default: 'manager' },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

userSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
  },
});

export default mongoose.model<IUser>('User', userSchema);
