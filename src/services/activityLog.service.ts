import ActivityLog from '../models/ActivityLog';

export async function getActivityLogs() {
  return ActivityLog.find().sort({ created_at: -1 }).limit(10);
}
