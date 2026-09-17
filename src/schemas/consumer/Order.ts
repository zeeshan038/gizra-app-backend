import Joi from 'joi';

export const placeOrderSchema = Joi.object({
  user_id: Joi.number().required(),
  restaurant_id: Joi.number().required(),
  order_amount: Joi.number().required().min(0),
  payment_method: Joi.string().valid('cash_on_delivery', 'digital_payment').default('cash_on_delivery'),
  delivery_address_id: Joi.number().optional(),
  order_note: Joi.string().optional().allow(''),
  order_type: Joi.string().valid('delivery', 'take_away').default('delivery'),
  delivery_charge: Joi.number().default(0),
  total_tax_amount: Joi.number().default(0),
});
