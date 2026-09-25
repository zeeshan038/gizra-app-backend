import Joi from 'joi';

/** Line items (buy-now or explicit payload). */
export const placeOrderItemSchema = Joi.object({
  item_id: Joi.number().required(),
  item_type: Joi.string().valid('Food', 'ItemCampaign').default('Food'),
  price: Joi.number().optional(),
  quantity: Joi.number().integer().min(1).required(),
  add_on_ids: Joi.array().items(Joi.number()).optional().default([]),
  add_on_qtys: Joi.array().items(Joi.number()).optional().default([]),
  variations: Joi.array().items(Joi.object()).optional().default([]),
  variation_options: Joi.array().items(Joi.object()).optional().default([]),
});

export const placeOrderSchema = Joi.object({
  restaurant_id: Joi.number().required(),
  order_amount: Joi.number().optional().min(0),
  payment_method: Joi.string()
    .valid('cash_on_delivery', 'digital_payment', 'wallet', 'offline_payment')
    .default('cash_on_delivery'),
  order_type: Joi.string().valid('delivery', 'take_away', 'dine_in').default('delivery'),
  delivery_address_id: Joi.number().optional(),
  order_note: Joi.string().optional().allow(''),
  delivery_charge: Joi.number().optional().min(0),
  total_tax_amount: Joi.number().optional().min(0),
  schedule_at: Joi.date().iso().optional(),
  dm_tips: Joi.number().min(0).optional(),
  coupon_code: Joi.string().optional().allow(''),
  distance: Joi.number().min(0).when('order_type', {
    is: 'delivery',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  address: Joi.string().when('order_type', {
    is: 'delivery',
    then: Joi.when('delivery_address_id', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    otherwise: Joi.optional(),
  }),
  latitude: Joi.alternatives(Joi.string(), Joi.number()).when('order_type', {
    is: 'delivery',
    then: Joi.when('delivery_address_id', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    otherwise: Joi.optional(),
  }),
  longitude: Joi.alternatives(Joi.string(), Joi.number()).when('order_type', {
    is: 'delivery',
    then: Joi.when('delivery_address_id', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    otherwise: Joi.optional(),
  }),
  address_type: Joi.string().optional(),
  floor: Joi.string().optional().allow(''),
  road: Joi.string().optional().allow(''),
  house: Joi.string().optional().allow(''),
  contact_person_name: Joi.string().optional().allow(''),
  contact_person_number: Joi.string().optional().allow(''),
  contact_person_email: Joi.string().optional().allow(''),
  delivery_instruction: Joi.string().optional().allow(''),
  unavailable_item_note: Joi.string().optional().allow(''),
  cutlery: Joi.boolean().optional(),
  extra_packaging_amount: Joi.number().min(0).optional(),
  partial_payment: Joi.boolean().optional(),
  is_buy_now: Joi.boolean().default(false),
  cart_id: Joi.number().optional(),
  cart: Joi.array().items(placeOrderItemSchema).optional(),
  items: Joi.array().items(placeOrderItemSchema).optional(),
  guest_id: Joi.number().optional(),
  is_guest: Joi.boolean().optional(),
});

export type PlaceOrderInput = {
  restaurant_id: number;
  order_amount?: number;
  payment_method: string;
  order_type: string;
  delivery_address_id?: number;
  order_note?: string;
  delivery_charge?: number;
  total_tax_amount?: number;
  schedule_at?: Date;
  dm_tips?: number;
  coupon_code?: string;
  distance?: number;
  address?: string;
  latitude?: string | number;
  longitude?: string | number;
  address_type?: string;
  floor?: string;
  road?: string;
  house?: string;
  contact_person_name?: string;
  contact_person_number?: string;
  contact_person_email?: string;
  delivery_instruction?: string;
  unavailable_item_note?: string;
  cutlery?: boolean;
  extra_packaging_amount?: number;
  partial_payment?: boolean;
  is_buy_now?: boolean;
  cart_id?: number;
  cart?: Array<{
    item_id: number;
    item_type?: string;
    price?: number;
    quantity: number;
    add_on_ids?: number[];
    add_on_qtys?: number[];
    variations?: unknown[];
    variation_options?: unknown[];
  }>;
  items?: PlaceOrderInput['cart'];
  guest_id?: number;
  is_guest?: boolean;
};
