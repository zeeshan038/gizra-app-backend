/** Request body docs when swagger-autogen cannot infer Joi-validated payloads. */

const PLACE_ORDER_LINE_ITEM_EXAMPLE = {
  item_id: 101,
  item_type: 'Food',
  quantity: 2,
  price: 12.99,
  add_on_ids: [],
  add_on_qtys: [],
  variations: [],
  variation_options: []
};

const PLACE_ORDER_BODY_EXAMPLE = {
  restaurant_id: 12,
  order_type: 'delivery',
  payment_method: 'cash_on_delivery',
  distance: 2.5,
  delivery_address_id: 3,
  order_note: 'Ring the bell',
  dm_tips: 1,
  cutlery: true,
  is_buy_now: true,
  items: [PLACE_ORDER_LINE_ITEM_EXAMPLE],
  guest_id: 55
};

const PLACE_ORDER_CART_EXAMPLE = {
  restaurant_id: 12,
  order_type: 'delivery',
  payment_method: 'cash_on_delivery',
  distance: 1.2,
  delivery_address_id: 3,
  is_buy_now: false
};

function registerRequestBodySchemas(schemas) {
  schemas.PlaceOrderLineItem = {
    type: 'object',
    required: ['item_id', 'quantity'],
    properties: {
      item_id: { type: 'number', example: 101 },
      item_type: {
        type: 'string',
        enum: ['Food', 'ItemCampaign'],
        default: 'Food'
      },
      price: { type: 'number', example: 12.99 },
      quantity: { type: 'integer', minimum: 1, example: 2 },
      add_on_ids: { type: 'array', items: { type: 'number' }, example: [] },
      add_on_qtys: { type: 'array', items: { type: 'number' }, example: [] },
      variations: { type: 'array', items: { type: 'object' }, example: [] },
      variation_options: { type: 'array', items: { type: 'object' }, example: [] }
    }
  };

  schemas.PlaceOrderRequest = {
    type: 'object',
    required: ['restaurant_id'],
    description:
      'Checkout payload. Use saved address via delivery_address_id, or inline address fields when no id. ' +
      'For delivery, distance (km) is required. Cart checkout: omit items/cart and use DB cart; buy-now: set is_buy_now true with items (or cart array). ' +
      'Guest checkout: send guest_id from POST /consumer/guest/request when not using Bearer token.',
    properties: {
      restaurant_id: { type: 'number', example: 12 },
      order_type: {
        type: 'string',
        enum: ['delivery', 'take_away', 'dine_in'],
        default: 'delivery'
      },
      payment_method: {
        type: 'string',
        enum: ['cash_on_delivery', 'digital_payment', 'wallet', 'offline_payment'],
        default: 'cash_on_delivery'
      },
      order_amount: { type: 'number', minimum: 0 },
      delivery_charge: { type: 'number', minimum: 0 },
      total_tax_amount: { type: 'number', minimum: 0 },
      distance: {
        type: 'number',
        minimum: 0,
        description: 'Required when order_type is delivery',
        example: 2.5
      },
      delivery_address_id: {
        type: 'number',
        description: 'Saved address from GET /consumer/addresses/list'
      },
      address: { type: 'string' },
      latitude: { oneOf: [{ type: 'string' }, { type: 'number' }] },
      longitude: { oneOf: [{ type: 'string' }, { type: 'number' }] },
      address_type: { type: 'string' },
      floor: { type: 'string' },
      road: { type: 'string' },
      house: { type: 'string' },
      contact_person_name: { type: 'string' },
      contact_person_number: { type: 'string' },
      contact_person_email: { type: 'string' },
      order_note: { type: 'string' },
      delivery_instruction: { type: 'string' },
      unavailable_item_note: { type: 'string' },
      coupon_code: { type: 'string' },
      schedule_at: { type: 'string', format: 'date-time' },
      dm_tips: { type: 'number', minimum: 0 },
      cutlery: { type: 'boolean' },
      extra_packaging_amount: { type: 'number', minimum: 0 },
      partial_payment: { type: 'boolean' },
      is_buy_now: { type: 'boolean', default: false },
      cart_id: { type: 'number' },
      cart: {
        type: 'array',
        items: { $ref: '#/components/schemas/PlaceOrderLineItem' }
      },
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/PlaceOrderLineItem' }
      },
      guest_id: { type: 'number', description: 'Guest id when placing without login' },
      is_guest: { type: 'boolean' }
    }
  };
}

const ROUTE_REQUEST_BODIES = {
  'post /consumer/order/place': {
    required: true,
    description: 'Place order (cart from DB or buy-now line items). Matches placeOrderSchema in src/schemas/consumer/Order.ts.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/PlaceOrderRequest' },
        examples: {
          buyNowDelivery: {
            summary: 'Buy now — delivery with saved address',
            value: PLACE_ORDER_BODY_EXAMPLE
          },
          cartCheckout: {
            summary: 'Checkout — cart already in DB',
            value: PLACE_ORDER_CART_EXAMPLE
          }
        }
      }
    }
  }
};

function applyRequestBodies(paths, components) {
  registerRequestBodySchemas(components.schemas);
  for (const [routePath, methods] of Object.entries(paths)) {
    for (const [method, endpoint] of Object.entries(methods)) {
      if (!endpoint || typeof endpoint !== 'object') continue;
      const key = `${method.toLowerCase()} ${routePath}`;
      const body = ROUTE_REQUEST_BODIES[key];
      if (!body) continue;
      endpoint.requestBody = JSON.parse(JSON.stringify(body));
      endpoint.description =
        (endpoint.description ? `${endpoint.description.trim()} ` : '') +
        'Bearer JWT optional for logged-in users; guest_id required for guest checkout.';
      endpoint.security = [{ bearerAuth: [] }];
    }
  }
}

module.exports = {
  applyRequestBodies,
  ROUTE_REQUEST_BODIES
};
