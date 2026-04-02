import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  created_at: Date;
  category_id: mongoose.Types.ObjectId | null;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    category_id: { type: String, ref: 'Category', required: true, unique: true, },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

categorySchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
  },
});

export default mongoose.model<ICategory>('Category', categorySchema);
