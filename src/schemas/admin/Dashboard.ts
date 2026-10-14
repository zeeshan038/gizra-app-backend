import Joi from 'joi';
import { ADMIN_DASHBOARD_STATISTICS_TYPES } from '../../utils/admin/dashboard/types';

const periodSchema = Joi.string()
  .valid(...ADMIN_DASHBOARD_STATISTICS_TYPES)
  .default('overall');

export const adminDashboardQuerySchema = Joi.object({
  zone_id: Joi.string().default('all'),
  statistics_type: periodSchema,
  user_overview: periodSchema,
});
