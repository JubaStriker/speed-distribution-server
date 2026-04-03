import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  category_id: String;
  category_name: string;
  price: number;
  stock_quantity: number;
  min_stock_threshold: number;
  status: 'active' | 'out_of_stock';
  created_at: Date;
  updated_at: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    category_id: { type: String, ref: 'Category', required: true },
    category_name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock_quantity: { type: Number, required: true, default: 0, min: 0 },
    min_stock_threshold: { type: Number, required: true, default: 5, min: 0 },
    status: { type: String, enum: ['active', 'out_of_stock'], default: 'active' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

productSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id.toString();
    if (ret.category_id && typeof ret.category_id === 'object') {
      ret.category_name = ret.category_id.name ?? ret.category_name;
      ret.category_id = ret.category_id._id?.toString() ?? ret.category_id.id;
    } else {
      ret.category_id = ret.category_id?.toString();
    }
    delete ret._id;
  },
});

export default mongoose.model<IProduct>('Product', productSchema);
