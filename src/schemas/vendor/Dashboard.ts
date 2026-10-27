import Joi from 'joi';

export const dashboardOrderStatsQuerySchema = Joi.object({
  statistics_type: Joi.string()
    .valid('overall', 'today', 'this_month')
    .default('overall'),
});
