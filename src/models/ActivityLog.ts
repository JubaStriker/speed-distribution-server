import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityLog extends Document {
  message: string;
  userEmail: string;
  created_at: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    message: { type: String, required: true },
    userEmail: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

activityLogSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
  },
});

export default mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
