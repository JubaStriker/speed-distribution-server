import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRestockQueue extends Document {
  product_id: Types.ObjectId;
  added_at: Date;
  restock_status: 'pending' | 'completed';
}

const restockQueueSchema = new Schema<IRestockQueue>(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    added_at: { type: Date, default: Date.now },
    restock_status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  },
  { versionKey: false }
);

restockQueueSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id.toString();
    ret.product_id = ret.product_id?.toString();
    delete ret._id;
  },
});

export default mongoose.model<IRestockQueue>('RestockQueue', restockQueueSchema);
