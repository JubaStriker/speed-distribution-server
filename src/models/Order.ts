import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IOrderItem {
  _id?: Types.ObjectId;
  product_id: Types.ObjectId;
  quantity: number;
  unit_price: number;
}

export interface IOrder extends Document {
  customer_name: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  total_price: number;
  items: IOrderItem[];
  created_at: Date;
  updated_at: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true, min: 0 },
  },
  { versionKey: false }
);

const orderSchema = new Schema<IOrder>(
  {
    customer_name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    total_price: { type: Number, required: true, default: 0 },
    items: [orderItemSchema],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

orderSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    if (Array.isArray(ret.items)) {
      ret.items = ret.items.map((item: any) => {
        item.id = item._id?.toString();
        item.product_id = item.product_id?.toString();
        delete item._id;
        return item;
      });
    }
  },
});

export default mongoose.model<IOrder>('Order', orderSchema);
