import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  created_at: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

categorySchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
  },
});

export default mongoose.model<ICategory>('Category', categorySchema);
