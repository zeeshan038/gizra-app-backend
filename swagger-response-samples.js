/** Realistic OpenAPI examples aligned with API formatters (not generic placeholders). */

const SAMPLE_CONSUMER_RESTAURANT = {
  id: '12',
  name: 'Demo Kitchen',
  logo: 'https://cdn.example.com/logo.png',
  cover_photo: 'https://cdn.example.com/cover.png',
  delivery_time: '30-40 min',
  minimum_order: 10,
  tax: 5,
  rating: 4.5,
  address: '123 Main Street'
};

const SAMPLE_CONSUMER_FOOD = {
  id: '101',
  name: 'Margherita Pizza',
  description: 'Classic tomato and mozzarella',
  image: 'https://cdn.example.com/food.png',
  category_id: '5',
  restaurant_id: '12',
  price: 12.99,
  discount: 0,
  veg: true,
  status: true,
  variations: [],
  add_ons: []
};

const SAMPLE_PLACED_ORDER = {
  id: '1001',
  user_id: '7',
  restaurant_id: '12',
  order_amount: 45.5,
  delivery_charge: 3,
  total_tax_amount: 2.5,
  additional_charge: 0,
  dm_tips: 0,
  payment_status: 'unpaid',
  order_status: 'pending',
  payment_method: 'cash_on_delivery',
  order_type: 'delivery',
  scheduled: false,
  schedule_at: null,
  created_at: '2026-01-15T10:30:00.000Z'
};

const SAMPLE_ORDER_LIST_ITEM = {
  id: '100072',
  order_id: '100072',
  order_number: '100072',
  restaurant_id: '3',
  restaurant_name: 'Pizza House',
  restaurant_logo: 'logo.png',
  image: 'food-thumb.jpg',
  order_amount: 45.5,
  order_status: 'confirmed',
  status_label: 'Confirmed',
  payment_status: 'unpaid',
  created_at: '2026-01-15T10:30:00.000Z',
  order_date: '15 Jan 2026',
  order_time: '10:30',
  track_order: true
};

/** Vendor order list rows and autogen fallbacks. */
const SAMPLE_ORDER_SUMMARY = {
  id: '1001',
  order_status: 'confirmed',
  order_type: 'delivery',
  payment_status: 'paid',
  order_amount: 45.5,
  created_at: '2026-01-15T10:30:00.000Z',
  customer_name: 'John Doe',
  customer_phone: '+1234567890'
};

const SAMPLE_ORDER_TRACK_DATA = {
  id: '100072',
  user_id: '7',
  restaurant_id: '3',
  order_amount: 45.5,
  delivery_charge: 3,
  total_tax_amount: 2.5,
  payment_status: 'unpaid',
  order_status: 'confirmed',
  status_label: 'Confirmed',
  payment_method: 'cash_on_delivery',
  order_type: 'delivery',
  scheduled: false,
  schedule_at: null,
  created_at: '2026-01-15T10:30:00.000Z',
  updated_at: '2026-01-15T10:35:00.000Z',
  pending: '2026-01-15T10:30:00.000Z',
  accepted: null,
  confirmed: '2026-01-15T10:32:00.000Z',
  processing: null,
  handover: null,
  picked_up: null,
  delivered: null,
  canceled: null,
  delivery_address: {
    contact_person_name: 'John Doe',
    contact_person_number: '03001234567',
    address: '123 Main St',
    latitude: '33.6844',
    longitude: '73.0479'
  },
  restaurant: {
    id: '3',
    name: 'Pizza House',
    logo: 'logo.png',
    logo_url: 'https://cdn.example.com/restaurant/logo.png',
    phone: '+923001234567',
    address: 'Block A',
    latitude: 33.68,
    longitude: 73.04
  },
  delivery_man: {
    id: '8',
    f_name: 'Ali',
    l_name: 'Khan',
    phone: '+923009876543',
    email: 'ali@example.com',
    image: 'driver.png',
    image_url: 'https://cdn.example.com/driver.png'
  },
  details_count: 2,
  dm_tips: 0,
  delivery_man_id: '8',
  cancellation_reason: null,
  canceled_by: null
};

const SAMPLE_VENDOR_ORDER_DETAIL = {
  id: '1001',
  order_status: 'confirmed',
  payment_status: 'paid',
  order_amount: 45.5,
  customer_name: 'John Doe',
  customer_phone: '+1234567890',
  customer_email: 'john@example.com',
  customer_orders_count: 3,
  delivery_address: '{"address":"123 Main St"}',
  items: [
    {
      id: '1',
      food_id: '101',
      food_name: 'Margherita Pizza',
      quantity: 2,
      price: 12.99,
      image: 'https://cdn.example.com/food.png'
    }
  ],
  restaurant: {
    name: 'Demo Kitchen',
    address: '123 Main Street',
    logo: 'https://cdn.example.com/logo.png'
  },
  pricing: {
    subtotal: 25.98,
    tax: 2.6,
    delivery_charge: 3,
    total: 31.58
  }
};

const SAMPLE_PROFILE_USER = {
  id: '7',
  f_name: 'John',
  l_name: 'Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  image: null,
  is_phone_verified: 1,
  is_email_verified: 1,
  ref_code: 'REF123',
  zone_id: 2,
  wallet_balance: 0,
  loyalty_point: 100,
  order_count: 5,
  current_language_key: 'en'
};

const SAMPLE_USERINFO = {
  id: '1',
  f_name: 'John',
  l_name: 'Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  image: null
};

const SAMPLE_ZONE_ROW = {
  id: 2,
  status: 1,
  name: 'Downtown',
  display_name: 'Downtown Zone',
  minimum_shipping_charge: 2,
  per_km_shipping_charge: 0.5,
  maximum_shipping_charge: 10
};

const SAMPLE_PAGINATION = {
  total: 42,
  limit: 20,
  offset: 0,
  page: 1,
  totalPages: 3
};

/** Full 200-body overrides when controller only returns variables / mappers. */
const ROUTE_RESPONSE_OVERRIDES = {
  'get /consumer/restaurants/all': {
    status: true,
    data: {
      total_size: 42,
      limit: 20,
      offset: 1,
      restaurants: [SAMPLE_CONSUMER_RESTAURANT]
    }
  },
  'get /consumer/restaurants/popular': {
    status: true,
    data: {
      total_size: 12,
      limit: 20,
      offset: 1,
      restaurants: [
        {
          ...SAMPLE_CONSUMER_RESTAURANT,
          order_count: 240,
          open: true,
          distance: 0.93,
          distance_text: '0.93 km'
        }
      ]
    }
  },
  'get /consumer/restaurants/nearby': {
    status: true,
    data: {
      total_size: 1,
      limit: 20,
      offset: 1,
      restaurants: [
        {
          ...SAMPLE_CONSUMER_RESTAURANT,
          order_count: 18,
          open: true,
          distance: 0.93,
          distance_text: '0.93 km'
        }
      ]
    }
  },
  'get /consumer/restaurants/{id}/foods': {
    status: true,
    data: {
      total_size: 15,
      limit: 20,
      offset: 1,
      foods: [SAMPLE_CONSUMER_FOOD]
    }
  },
  'get /consumer/foods/search': {
    status: true,
    data: {
      total_size: 8,
      limit: 20,
      offset: 1,
      foods: [SAMPLE_CONSUMER_FOOD]
    }
  },
  'get /consumer/restaurants/specfic/{id}': {
    status: true,
    data: {
      ...SAMPLE_CONSUMER_RESTAURANT,
      veg: true,
      non_veg: true,
      active: true,
      latitude: '40.7128',
      longitude: '-74.0060'
    }
  },
  'get /vendor/orders': {
    status: true,
    data: {
      total: 42,
      limit: 20,
      offset: 0,
      orders: [SAMPLE_ORDER_SUMMARY]
    }
  },
  'get /vendor/orders/{id}': {
    status: true,
    data: SAMPLE_VENDOR_ORDER_DETAIL
  },
  'get /consumer/config/zone-id': {
    zone_id: '[2]',
    zone_data: [SAMPLE_ZONE_ROW]
  },
  'get /consumer/zone/list': [
    {
      id: 2,
      name: 'Downtown',
      display_name: 'Downtown Zone',
      status: true,
      formated_coordinates: [{ lat: 40.71, lng: -74.0 }]
    }
  ],
  'get /consumer/whoami': {
    status: true,
    msg: 'Success',
    data: {
      ...SAMPLE_PROFILE_USER,
      userinfo: SAMPLE_USERINFO,
      order_count: 5,
      member_since_days: 120,
      is_valid_for_discount: false,
      discount_amount: 0,
      discount_amount_type: '',
      validity: ''
    }
  },
  'get /consumer/order/running': {
    status: true,
    msg: 'Success',
    data: {
      total_size: 2,
      limit: 10,
      offset: 1,
      page: 1,
      orders: [{ ...SAMPLE_ORDER_LIST_ITEM, track_order: true }]
    }
  },
  'get /consumer/order/history': {
    status: true,
    msg: 'Success',
    data: {
      total_size: 10,
      limit: 10,
      offset: 1,
      page: 1,
      orders: [{ ...SAMPLE_ORDER_LIST_ITEM, order_status: 'delivered', status_label: 'Completed', track_order: false }]
    }
  },
  'get /consumer/order/subscription': {
    status: true,
    msg: 'Success',
    data: {
      total_size: 0,
      limit: 10,
      offset: 1,
      page: 1,
      orders: []
    }
  },
  'get /consumer/order/track': {
    status: true,
    msg: 'Success',
    data: SAMPLE_ORDER_TRACK_DATA
  },
  'put /consumer/order/cancel': {
    status: true,
    msg: 'Order canceled successfully',
    message: 'Order canceled successfully'
  },
  'post /consumer/order/place': {
    status: true,
    msg: 'Order placed successfully',
    message: 'Order placed successfully',
    order_id: '1001',
    total_ammount: 51,
    data: SAMPLE_PLACED_ORDER
  },
  'get /consumer/favourites/list': {
    status: true,
    msg: 'Success',
    data: {
      foods: [SAMPLE_CONSUMER_FOOD],
      restaurants: [SAMPLE_CONSUMER_RESTAURANT]
    }
  }
};

function paginatedList(key) {
  const base = { total_size: 42, limit: 20, offset: 1 };
  if (key === 'restaurants') return { ...base, restaurants: [SAMPLE_CONSUMER_RESTAURANT] };
  if (key === 'foods') return { ...base, foods: [SAMPLE_CONSUMER_FOOD] };
  if (key === 'orders') return { ...base, orders: [SAMPLE_ORDER_SUMMARY] };
  return base;
}

function inferValueFromExpression(expr, key) {
  const e = expr.trim();

  if (e === 'true') return true;
  if (e === 'false') return false;
  if (e === 'null') return null;
  if (/^[\d.]+$/.test(e)) return Number(e);
  if (e.includes('.toString()')) return '1';
  if (/^Number\(/.test(e)) return 1;
  if (/^JSON\.stringify\(/.test(e)) return '[2]';

  if (e.includes('?')) {
    if (/verified/i.test(key)) return 1;
    if (/valid|status|active/i.test(key)) return true;
    return 0;
  }

  const paginationKeys = {
    total_size: 42,
    total: 42,
    limit: 20,
    offset: 0,
    page: 1,
    totalPages: 3,
    order_count: 5,
    member_since_days: 120,
    wallet_balance: 0,
    loyalty_point: 100,
    discount_amount: 0,
    minimum_order: 10,
    rating: 4.5,
    tax: 5,
    price: 12.99,
    delivery_charge: 3
  };
  if (paginationKeys[key] !== undefined) return paginationKeys[key];
  if (e === 'total' || e === 'total_size') return 42;
  if (e === 'limit') return 20;
  if (e === 'page') return 1;
  if (e === 'offset' || e === 'skip') return 0;

  if (/^mappedOrder$/.test(e) || /mappedOrder/.test(e)) return { ...SAMPLE_PLACED_ORDER };
  if (/^mapVendorOrderDetail\(/.test(e)) return SAMPLE_VENDOR_ORDER_DETAIL;
  if (/^mapOrderSummary\(/.test(e)) return SAMPLE_ORDER_SUMMARY;
  if (/formatProfileUser/.test(e)) return { ...SAMPLE_PROFILE_USER };
  if (/formatUserinfo/.test(e)) return { ...SAMPLE_USERINFO };
  if (/formatZoneDataRow|zone_data/.test(e) || key === 'zone_data') return [{ ...SAMPLE_ZONE_ROW }];

  const k = key.toLowerCase();
  if (k === 'restaurants' || /formattedrestaurants/i.test(e)) return [SAMPLE_CONSUMER_RESTAURANT];
  if (k === 'foods' || /formattedfoods/i.test(e)) return [SAMPLE_CONSUMER_FOOD];
  if (k === 'orders' && (e === 'data' || e === 'orders')) return [SAMPLE_ORDER_SUMMARY];
  if (k === 'orders') return [SAMPLE_ORDER_SUMMARY];
  if (k === 'lineitems' || k === 'items') return SAMPLE_VENDOR_ORDER_DETAIL.items;
  if (k === 'customer') {
    return {
      f_name: 'John',
      l_name: 'Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      orders_count: 3
    };
  }
  if (k === 'restaurant' && e === 'restaurant') return SAMPLE_VENDOR_ORDER_DETAIL.restaurant;
  if (k === 'userinfo') return { ...SAMPLE_USERINFO };
  if (k === 'is_valid_for_discount') return false;
  if (k === 'discount_amount_type' || k === 'validity') return '';

  if (k === 'data' && e === 'data') return paginatedList('orders');

  if (k.includes('count')) return 5;
  if (k.includes('amount')) return 0;
  if (k.startsWith('is_')) return 1;

  return null;
}

module.exports = {
  ROUTE_RESPONSE_OVERRIDES,
  SAMPLE_CONSUMER_RESTAURANT,
  SAMPLE_CONSUMER_FOOD,
  inferValueFromExpression
};
