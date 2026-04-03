import ActivityLog from '../models/ActivityLog';

interface GetActivityLogsParams {
  page: number;
  limit: number;
  userId?: string;
  method?: string;
}

export async function getActivityLogs({ page, limit }: GetActivityLogsParams) {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    ActivityLog.find().sort({ created_at: -1 }).skip(skip).limit(limit),
    ActivityLog.countDocuments(),
  ]);
  return { logs, total, page, limit };
}

export async function createLog(message: string, userEmail: string): Promise<void> {
  await ActivityLog.create({ message, userEmail });
}
