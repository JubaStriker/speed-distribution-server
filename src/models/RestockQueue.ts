import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRestockQueue extends Document {
  product_id: Types.ObjectId;
  added_at: Date;
}

const restockQueueSchema = new Schema<IRestockQueue>(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    added_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

restockQueueSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    ret.product_id = ret.product_id?.toString();
    delete ret._id;
  },
});

export default mongoose.model<IRestockQueue>('RestockQueue', restockQueueSchema);
