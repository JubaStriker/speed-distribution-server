import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  category_id: Types.ObjectId;
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
    category_id: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
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
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    ret.category_id = ret.category_id?.toString();
    delete ret._id;
  },
});

export default mongoose.model<IProduct>('Product', productSchema);
