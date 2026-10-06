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

/** Chat — flat JSON (PHP ConversationController), no status/msg wrapper. */
const SAMPLE_CHAT_USER_CUSTOMER = {
  id: 11,
  f_name: 'Jane',
  l_name: 'Doe',
  phone: '+12025550100',
  email: 'jane@example.com',
  image: 'https://cdn.example.com/profile/jane.jpg',
  admin_id: null,
  user_id: 7,
  vendor_id: null,
  deliveryman_id: null,
  created_at: '2026-03-01T09:00:00.000Z',
  updated_at: '2026-03-01T09:00:00.000Z'
};

const SAMPLE_CHAT_USER_VENDOR = {
  id: 22,
  f_name: 'Nickel Barn & Coffee',
  l_name: '',
  phone: '+12025550200',
  email: 'vendor@nickelbarn.com',
  image: 'https://cdn.example.com/restaurant/logo.png',
  admin_id: null,
  user_id: null,
  vendor_id: 3,
  deliveryman_id: null,
  created_at: '2026-03-01T09:00:00.000Z',
  updated_at: '2026-03-01T09:00:00.000Z'
};

const SAMPLE_CHAT_USER_DRIVER = {
  id: 33,
  f_name: 'Alex',
  l_name: 'Rider',
  phone: '+12025550300',
  email: 'alex.rider@example.com',
  image: 'https://cdn.example.com/driver/photo.jpg',
  admin_id: null,
  user_id: null,
  vendor_id: null,
  deliveryman_id: 12,
  created_at: '2026-03-01T09:00:00.000Z',
  updated_at: '2026-03-01T09:00:00.000Z'
};

const SAMPLE_CHAT_MESSAGE = {
  id: 903,
  conversation_id: 4,
  sender_id: 11,
  message: 'Where is my order?',
  file: null,
  is_seen: false,
  created_at: '2026-03-01T10:00:00.000Z',
  updated_at: '2026-03-01T10:00:00.000Z'
};

const SAMPLE_CHAT_CONVERSATION = {
  id: 4,
  sender_id: 11,
  receiver_id: 22,
  sender_type: 'customer',
  receiver_type: 'vendor',
  last_message_id: 903,
  last_message_time: '2026-03-01T10:00:00.000Z',
  unread_message_count: 0,
  created_at: '2026-03-01T09:30:00.000Z',
  updated_at: '2026-03-01T10:00:00.000Z',
  sender: SAMPLE_CHAT_USER_CUSTOMER,
  receiver: SAMPLE_CHAT_USER_VENDOR,
  last_message: SAMPLE_CHAT_MESSAGE
};

const SAMPLE_CHAT_THREAD = {
  total_size: 2,
  limit: 10,
  offset: 1,
  status: true,
  messages: [
    SAMPLE_CHAT_MESSAGE,
    {
      id: 904,
      conversation_id: 4,
      sender_id: 22,
      message: 'It is being prepared.',
      file: null,
      is_seen: true,
      created_at: '2026-03-01T10:05:00.000Z',
      updated_at: '2026-03-01T10:05:00.000Z'
    }
  ],
  conversation: SAMPLE_CHAT_CONVERSATION
};

const SAMPLE_CHAT_SEND = {
  total_size: 1,
  limit: 10,
  offset: 1,
  status: true,
  message: 'successfully sent!',
  messages: [SAMPLE_CHAT_MESSAGE],
  conversation: SAMPLE_CHAT_CONVERSATION
};

/** Full 200-body overrides when controller only returns variables / mappers. */
const ROUTE_RESPONSE_OVERRIDES = {
  'post /consumer/guest/request': {
    status: true,
    msg: 'Guest verified successfully',
    guest_id: '42',
    data: {
      guest_id: '42',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.guest-session-example'
    }
  },
  'get /consumer/restaurants/all': {
    status: true,
    data: {
      total_size: 42,
      limit: 20,
      offset: 1,
      restaurants: [SAMPLE_CONSUMER_RESTAURANT]
    }
  },
  'get /consumer/categories': {
    status: true,
    msg: 'Categories fetched successfully',
    data: {
      categories: [
        {
          id: '1',
          name: 'Pizza',
          image: 'pizza.png',
          image_full_url: 'https://cdn.example.com/category/pizza.png',
          slug: 'pizza',
          priority: 10,
          parent_id: '0',
          products_count: 24,
          order_count: 120
        }
      ]
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
      restaurants_total_size: 3,
      limit: 20,
      offset: 1,
      foods: [SAMPLE_CONSUMER_FOOD],
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
  },
  'get /pages/legal': {
    status: true,
    msg: 'Success',
    data: {
      terms_and_conditions: {
        title: 'Terms and conditions',
        content: '<p>Terms HTML…</p>',
        active: true
      },
      privacy_policy: {
        title: 'Privacy policy',
        content: '<p>Privacy HTML…</p>',
        active: true
      },
      about_us: {
        title: 'About us',
        content: '<p>About us…</p>',
        active: true
      },
      refund_policy: {
        title: 'Refund policy',
        content: '<p>Refund…</p>',
        active: true
      }
    }
  },
  'get /pages/{slug}': {
    status: true,
    msg: 'Success',
    data: {
      key: 'terms_and_conditions',
      title: 'Terms and conditions',
      content: '<p>Terms HTML…</p>',
      active: true
    }
  },
  'get /config': {
    business_name: 'Gizra',
    logo_full_url: 'https://cdn.example.com/business/logo.png',
    terms_and_conditions: '<p>Terms and conditions HTML…</p>',
    privacy_policy: '<p>Privacy policy HTML…</p>',
    about_us: '<p>About us content…</p>',
    refund_policy_status: 1,
    refund_policy_data: '<p>Refund policy…</p>',
    cancellation_policy_status: 0,
    cancellation_policy_data: '',
    shipping_policy_status: 0,
    shipping_policy_data: '',
    cookies_text: 'We use cookies to improve your experience.',
    footer_text: '© Gizra',
    cash_on_delivery: true,
    digital_payment: false,
    home_delivery: true,
    take_away: true,
    maintenance_mode: false,
    order_confirmation_model: 'restaurant',
    app_minimum_version_android: 1,
    app_minimum_version_android_restaurant: 1,
    app_minimum_version_android_deliveryman: 1,
    app_url_android_deliveryman: 'https://play.google.com/store/apps/details?id=app.gizra.driver',
    centralize_login: {
      manual_login_status: 1,
      otp_login_status: 1,
      social_login_status: 0
    },
    deliveryman_additional_join_us_page_data: null,
    restaurant_additional_join_us_page_data: null,
    language: [{ key: 'en', value: 'en' }]
  },
  'get /consumer/config': {
    business_name: 'Gizra',
    terms_and_conditions: '<p>Terms and conditions HTML…</p>',
    privacy_policy: '<p>Privacy policy HTML…</p>',
    about_us: '<p>About us content…</p>',
    refund_policy_status: 1,
    cookies_text: 'We use cookies…',
    cash_on_delivery: true,
    home_delivery: true,
    app_minimum_version_android_deliveryman: 1
  },
  'get /delivery-man/orders/{id}': {
    status: true,
    msg: 'Success',
    data: {
      id: '100178',
      user_id: '7',
      vendor_id: '3',
      order_status: 'handover',
      status_label: 'Handover',
      payment_status: 'unpaid',
      payment_method: 'cash_on_delivery',
      order_type: 'delivery',
      order_amount: 60,
      delivery_charge: 30,
      is_manual_dispatch: true,
      dispatch_summary: {
        title: 'Manual Dispatch delivery request',
        delivery_fee: 30
      },
      restaurant: {
        id: '5',
        name: 'Quatta Cafe',
        phone: '+923001234567',
        address_snippet: 'block D, Saon Garden',
        image_url: 'https://cdn.example.com/restaurant/logo.png'
      },
      customer: {
        name: 'Mudasir Khan',
        phone: '+923009876543',
        address_snippet: 'block B, Saon Garden',
        image_url: 'https://cdn.example.com/profile/user.jpg'
      },
      items: [
        {
          food_name: 'Chicken Biryani',
          quantity: 1,
          unit_label: 'Plate',
          price: 30,
          line_total: 30,
          food_image_url: 'https://cdn.example.com/food/biryani.png'
        }
      ],
      pricing: {
        items_price: 160.06,
        discount: 0,
        vat_tax: 16,
        tax_percent: 10,
        delivery_man_tips: 0,
        addons: 0,
        delivery_charge: 30,
        subtotal: 60
      },
      can_accept: false,
      can_update_status: true,
      assigned_to_me: true
    }
  },
  'get /consumer/message/list': {
    type: 'vendor',
    total_size: 1,
    limit: 10,
    offset: 1,
    conversations: [SAMPLE_CHAT_CONVERSATION]
  },
  'get /consumer/message/search-list': {
    total_size: 1,
    limit: 10,
    offset: 1,
    conversations: [SAMPLE_CHAT_CONVERSATION]
  },
  'get /consumer/message/details': SAMPLE_CHAT_THREAD,
  'post /consumer/message/send': SAMPLE_CHAT_SEND,
  'post /consumer/message/chat-image': {
    image_url: 'https://cdn.example.com/conversation/photo.jpg'
  },
  'get /vendor/message/list': {
    type: 'customer',
    total_size: 1,
    limit: 10,
    offset: 1,
    conversation: [SAMPLE_CHAT_CONVERSATION]
  },
  'get /vendor/message/search-list': {
    total_size: 1,
    limit: 10,
    offset: 1,
    conversation: [SAMPLE_CHAT_CONVERSATION]
  },
  'get /vendor/message/details': SAMPLE_CHAT_THREAD,
  'post /vendor/message/send': SAMPLE_CHAT_SEND,
  'post /vendor/message/chat-image': {
    image_url: 'https://cdn.example.com/conversation/photo.jpg'
  },
  'get /delivery-man/message/list': {
    type: 'customer',
    total_size: 1,
    limit: 10,
    offset: 1,
    conversation: [SAMPLE_CHAT_CONVERSATION]
  },
  'get /delivery-man/message/search-list': {
    total_size: 1,
    limit: 10,
    offset: 1,
    conversation: [SAMPLE_CHAT_CONVERSATION]
  },
  'get /delivery-man/message/details': SAMPLE_CHAT_THREAD,
  'post /delivery-man/message/send': SAMPLE_CHAT_SEND,
  'post /delivery-man/message/chat-image': {
    image_url: 'https://cdn.example.com/conversation/photo.jpg'
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
