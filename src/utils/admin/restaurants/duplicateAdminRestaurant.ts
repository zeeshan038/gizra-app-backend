import bcrypt from 'bcrypt';
import prisma from '../../../config/database';
import { provisionAccountStorage } from '../../accountStorage';
import { isPointInZone } from '../../zone/db';
import { RESTAURANT_TRANSLATION_TYPE } from '../../../types/vendor/restaurantSetup';
import { parseStoredFoodAddonIds } from '../../vendor/catalog/foodAddonHelpers';

const FOOD_TRANSLATION_TYPE = 'App\\Models\\Food';
const CATEGORY_TRANSLATION_TYPE = 'App\\Models\\Category';

export type AdminDuplicateRestaurantInput = {
  /** New vendor / restaurant login */
  f_name: string;
  l_name?: string | null;
  phone: string;
  email: string;
  password: string;
  /** Optional overrides — defaults copy from source */
  name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  zone_id?: number | null;
  /** Copy full menu (categories, addons, foods, variations). Default true. */
  include_menu?: boolean;
};

function remapJsonIds(raw: string | null | undefined, idMap: Map<number, number>): string | null {
  if (raw == null || raw === '') return raw ?? null;
  try {
    const parsed = JSON.parse(raw);
    const remapValue = (value: unknown): unknown => {
      if (typeof value === 'number' && idMap.has(value)) return idMap.get(value);
      if (typeof value === 'string' && /^\d+$/.test(value)) {
        const n = Number(value);
        if (idMap.has(n)) return String(idMap.get(n));
      }
      if (Array.isArray(value)) return value.map(remapValue);
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          if ((k === 'id' || k === 'category_id') && (typeof v === 'number' || typeof v === 'string')) {
            out[k] = remapValue(v);
          } else {
            out[k] = remapValue(v);
          }
        }
        return out;
      }
      return value;
    };
    return JSON.stringify(remapValue(parsed));
  } catch {
    return raw;
  }
}

function remapAddonIdsJson(raw: string | null | undefined, addonMap: Map<number, number>): string | null {
  if (raw == null || raw === '') return raw ?? null;
  const ids = parseStoredFoodAddonIds(raw);
  if (!ids.length) return raw;
  const remapped = ids.map((id) => addonMap.get(id)).filter((id): id is number => id != null && id > 0);
  return JSON.stringify(remapped);
}

/**
 * Duplicate a restaurant (new vendor + restaurant) with optional full menu copy.
 * Skips orders, reviews, wallets, coupons, subscriptions, employees, campaigns.
 */
export async function duplicateAdminRestaurant(
  sourceRestaurantId: number,
  payload: AdminDuplicateRestaurantInput
) {
  const source = await prisma.restaurants.findUnique({
    where: { id: BigInt(sourceRestaurantId) },
  });
  if (!source) {
    throw new Error('Restaurant not found');
  }

  const sourceVendor = await prisma.vendors.findFirst({
    where: { id: BigInt(Number(source.vendor_id)) },
  });

  const latitude =
    payload.latitude != null && Number.isFinite(payload.latitude)
      ? payload.latitude
      : Number(source.latitude);
  const longitude =
    payload.longitude != null && Number.isFinite(payload.longitude)
      ? payload.longitude
      : Number(source.longitude);
  const zoneId =
    payload.zone_id != null && Number.isFinite(payload.zone_id)
      ? payload.zone_id
      : source.zone_id != null
        ? Number(source.zone_id)
        : null;

  if (zoneId == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Restaurant location or zone is missing; provide latitude, longitude, and zone_id');
  }

  const inZone = await isPointInZone(zoneId, latitude, longitude);
  if (!inZone) {
    throw new Error('Coordinates are outside the selected zone');
  }

  const existingVendor = await prisma.vendors.findFirst({
    where: { OR: [{ email: payload.email }, { phone: payload.phone }] },
  });
  if (existingVendor) {
    throw new Error('Email or phone already exists');
  }

  const existingRestaurant = await prisma.restaurants.findFirst({
    where: { OR: [{ email: payload.email }, { phone: payload.phone }] },
  });
  if (existingRestaurant) {
    throw new Error('Restaurant email or phone already exists');
  }

  const hashedPassword = await bcrypt.hash(payload.password, 10);
  const cloudflareId = await provisionAccountStorage('vendor', undefined);
  const includeMenu = payload.include_menu !== false;
  const now = new Date();
  const newName = (payload.name?.trim() || `${source.name} (Copy)`).slice(0, 191);
  const newAddress = payload.address?.trim() || source.address || '';

  const sourceIdNum = Number(source.id);

  const result = await prisma.$transaction(
    async (tx) => {
      const vendor = await tx.vendors.create({
        data: {
          f_name: payload.f_name,
          l_name: payload.l_name || sourceVendor?.l_name || null,
          email: payload.email,
          phone: payload.phone,
          password: hashedPassword,
          cloudflareId,
          status: true,
          created_at: now,
          updated_at: now,
        },
      });

      const restaurant = await tx.restaurants.create({
        data: {
          name: newName,
          phone: payload.phone,
          email: payload.email,
          logo: source.logo,
          latitude: String(latitude),
          longitude: String(longitude),
          address: newAddress,
          footer_text: source.footer_text,
          minimum_order: source.minimum_order,
          comission: source.comission,
          schedule_order: source.schedule_order,
          opening_time: source.opening_time,
          closeing_time: source.closeing_time,
          status: true,
          vendor_id: Number(vendor.id),
          free_delivery: source.free_delivery,
          rating: null,
          cover_photo: source.cover_photo,
          delivery: source.delivery,
          take_away: source.take_away,
          food_section: source.food_section,
          tax: source.tax,
          zone_id: zoneId,
          reviews_section: source.reviews_section,
          active: true,
          paused_until: null,
          pause_message: null,
          pause_type: null,
          off_day: source.off_day,
          gst: source.gst,
          self_delivery_system: source.self_delivery_system,
          pos_system: source.pos_system,
          minimum_shipping_charge: source.minimum_shipping_charge,
          base_distance_km: source.base_distance_km,
          delivery_time: source.delivery_time,
          veg: source.veg,
          non_veg: source.non_veg,
          order_count: BigInt(0),
          total_order: BigInt(0),
          per_km_shipping_charge: source.per_km_shipping_charge,
          restaurant_model: source.restaurant_model ?? 'none',
          maximum_shipping_charge: source.maximum_shipping_charge,
          slug: null,
          order_subscription_active: source.order_subscription_active,
          cutlery: source.cutlery,
          meta_title: source.meta_title,
          meta_description: source.meta_description,
          meta_image: source.meta_image,
          announcement: source.announcement,
          announcement_message: source.announcement_message,
          qr_code: null,
          free_delivery_distance: source.free_delivery_distance,
          additional_data: source.additional_data,
          additional_documents: source.additional_documents,
          package_id: source.package_id,
          created_at: now,
          updated_at: now,
        },
      });

      const newRestaurantId = Number(restaurant.id);

      // Cuisines
      const cuisineLinks = await tx.cuisine_restaurant.findMany({
        where: { restaurant_id: sourceIdNum },
      });
      if (cuisineLinks.length) {
        await tx.cuisine_restaurant.createMany({
          data: cuisineLinks.map((row) => ({
            restaurant_id: newRestaurantId,
            cuisine_id: row.cuisine_id,
          })),
        });
      }

      // Tags
      const tagLinks = await tx.restaurant_tag.findMany({
        where: { restaurant_id: sourceIdNum },
      });
      if (tagLinks.length) {
        await tx.restaurant_tag.createMany({
          data: tagLinks.map((row) => ({
            restaurant_id: newRestaurantId,
            tag_id: row.tag_id,
          })),
        });
      }

      // Characteristics
      const charLinks = await tx.characteristic_restaurant.findMany({
        where: { restaurant_id: sourceIdNum },
      });
      if (charLinks.length) {
        await tx.characteristic_restaurant.createMany({
          data: charLinks.map((row) => ({
            restaurant_id: newRestaurantId,
            characteristic_id: row.characteristic_id,
          })),
        });
      }

      // Schedules
      const schedules = await tx.restaurant_schedule.findMany({
        where: { restaurant_id: sourceIdNum },
      });
      if (schedules.length) {
        await tx.restaurant_schedule.createMany({
          data: schedules.map((row) => ({
            restaurant_id: newRestaurantId,
            day: row.day,
            opening_time: row.opening_time,
            closing_time: row.closing_time,
            created_at: now,
            updated_at: now,
          })),
        });
      }

      // Config
      const config = await tx.restaurant_configs.findFirst({
        where: { restaurant_id: sourceIdNum },
      });
      if (config) {
        await tx.restaurant_configs.create({
          data: {
            restaurant_id: newRestaurantId,
            instant_order: config.instant_order,
            customer_date_order_sratus: config.customer_date_order_sratus,
            customer_order_date: config.customer_order_date,
            halal_tag_status: config.halal_tag_status,
            extra_packaging_status: config.extra_packaging_status,
            is_extra_packaging_active: config.is_extra_packaging_active,
            extra_packaging_amount: config.extra_packaging_amount,
            dine_in: config.dine_in,
            schedule_advance_dine_in_booking_duration: config.schedule_advance_dine_in_booking_duration,
            schedule_advance_dine_in_booking_duration_time_format:
              config.schedule_advance_dine_in_booking_duration_time_format,
            created_at: now,
            updated_at: now,
          },
        });
      }

      // Notification settings
      const notifSettings = await tx.restaurant_notification_settings.findMany({
        where: { restaurant_id: sourceIdNum },
      });
      if (notifSettings.length) {
        await tx.restaurant_notification_settings.createMany({
          data: notifSettings.map((row) => ({
            title: row.title,
            sub_title: row.sub_title,
            key: row.key,
            restaurant_id: newRestaurantId,
            mail_status: row.mail_status,
            sms_status: row.sms_status,
            push_notification_status: row.push_notification_status,
            created_at: now,
            updated_at: now,
          })),
        });
      }

      // Restaurant translations
      const restaurantTranslations = await tx.translations.findMany({
        where: {
          translationable_type: RESTAURANT_TRANSLATION_TYPE,
          translationable_id: sourceIdNum,
        },
      });
      if (restaurantTranslations.length) {
        await tx.translations.createMany({
          data: restaurantTranslations.map((row) => ({
            translationable_type: RESTAURANT_TRANSLATION_TYPE,
            translationable_id: newRestaurantId,
            locale: row.locale,
            key: row.key,
            value:
              row.key === 'name' && row.value
                ? (payload.name?.trim() ? row.value : `${row.value} (Copy)`)
                : row.key === 'address' && payload.address?.trim()
                  ? payload.address.trim()
                  : row.value,
            created_at: now,
            updated_at: now,
          })),
        });
      }

      let categories_copied = 0;
      let addons_copied = 0;
      let foods_copied = 0;

      if (includeMenu) {
        // Categories (restaurant-owned only)
        const categories = await tx.categories.findMany({
          where: { restaurant_id: sourceIdNum },
          orderBy: { id: 'asc' },
        });
        const categoryMap = new Map<number, number>();

        for (const cat of categories) {
          const created = await tx.categories.create({
            data: {
              restaurant_id: newRestaurantId,
              name: cat.name,
              image: cat.image,
              parent_id: BigInt(0),
              position: cat.position,
              status: cat.status,
              priority: cat.priority,
              slug: null,
              created_at: now,
              updated_at: now,
            },
          });
          categoryMap.set(Number(cat.id), Number(created.id));
          categories_copied += 1;
        }

        // Remap parent_id
        for (const cat of categories) {
          const oldParent = Number(cat.parent_id);
          const newId = categoryMap.get(Number(cat.id));
          const newParent = categoryMap.get(oldParent);
          if (newId != null && newParent != null && newParent > 0) {
            await tx.categories.update({
              where: { id: BigInt(newId) },
              data: { parent_id: BigInt(newParent) },
            });
          }
        }

        // Category translations
        if (categories.length) {
          const oldCatIds = categories.map((c) => Number(c.id));
          const catTranslations = await tx.translations.findMany({
            where: {
              translationable_type: CATEGORY_TRANSLATION_TYPE,
              translationable_id: { in: oldCatIds },
            },
          });
          if (catTranslations.length) {
            await tx.translations.createMany({
              data: catTranslations
                .map((row) => {
                  const newCatId = categoryMap.get(Number(row.translationable_id));
                  if (!newCatId) return null;
                  return {
                    translationable_type: CATEGORY_TRANSLATION_TYPE,
                    translationable_id: newCatId,
                    locale: row.locale,
                    key: row.key,
                    value: row.value,
                    created_at: now,
                    updated_at: now,
                  };
                })
                .filter((row): row is NonNullable<typeof row> => row != null),
            });
          }
        }

        // Add-ons
        const addons = await tx.add_ons.findMany({
          where: { restaurant_id: sourceIdNum },
          orderBy: { id: 'asc' },
        });
        const addonMap = new Map<number, number>();
        for (const addon of addons) {
          const created = await tx.add_ons.create({
            data: {
              name: addon.name,
              price: addon.price,
              restaurant_id: newRestaurantId,
              status: addon.status,
              stock_type: addon.stock_type,
              addon_stock: addon.addon_stock,
              sell_count: BigInt(0),
              created_at: now,
              updated_at: now,
            },
          });
          addonMap.set(Number(addon.id), Number(created.id));
          addons_copied += 1;
        }

        // Foods
        const foods = await tx.food.findMany({
          where: { restaurant_id: sourceIdNum },
          orderBy: { id: 'asc' },
        });
        const foodMap = new Map<number, number>();

        for (const food of foods) {
          const oldCategoryId = food.category_id != null ? Number(food.category_id) : null;
          const newCategoryId =
            oldCategoryId != null && categoryMap.has(oldCategoryId)
              ? categoryMap.get(oldCategoryId)!
              : oldCategoryId;

          const created = await tx.food.create({
            data: {
              name: food.name,
              description: food.description,
              image: food.image,
              category_id: newCategoryId,
              category_ids: remapJsonIds(food.category_ids, categoryMap),
              variations: food.variations,
              add_ons: remapAddonIdsJson(food.add_ons, addonMap),
              attributes: food.attributes,
              choice_options: food.choice_options,
              combo_definition: food.combo_definition,
              price: food.price,
              tax: food.tax,
              tax_type: food.tax_type,
              discount: food.discount,
              discount_type: food.discount_type,
              available_time_starts: food.available_time_starts,
              available_time_ends: food.available_time_ends,
              veg: food.veg,
              status: food.status,
              restaurant_id: newRestaurantId,
              order_count: BigInt(0),
              avg_rating: 0,
              rating_count: BigInt(0),
              rating: null,
              recommended: food.recommended,
              slug: null,
              maximum_cart_quantity: food.maximum_cart_quantity,
              is_halal: food.is_halal,
              item_stock: food.item_stock,
              sell_count: BigInt(0),
              stock_type: food.stock_type,
              is_draft: food.is_draft,
              position: food.position,
              created_at: now,
              updated_at: now,
            },
          });
          foodMap.set(Number(food.id), Number(created.id));
          foods_copied += 1;
        }

        // Legacy variations + options
        const oldFoodIds = [...foodMap.keys()];
        if (oldFoodIds.length) {
          const variations = await tx.variations.findMany({
            where: { food_id: { in: oldFoodIds } },
            orderBy: { id: 'asc' },
          });
          const variationMap = new Map<number, number>();
          for (const variation of variations) {
            const newFoodId = foodMap.get(Number(variation.food_id));
            if (!newFoodId) continue;
            const created = await tx.variations.create({
              data: {
                food_id: newFoodId,
                name: variation.name,
                type: variation.type,
                min: variation.min,
                max: variation.max,
                is_required: variation.is_required,
                created_at: now,
                updated_at: now,
              },
            });
            variationMap.set(Number(variation.id), Number(created.id));
          }

          const options = await tx.variation_options.findMany({
            where: { food_id: { in: oldFoodIds } },
          });
          if (options.length) {
            await tx.variation_options.createMany({
              data: options
                .map((opt) => {
                  const newFoodId = foodMap.get(Number(opt.food_id));
                  const newVariationId = variationMap.get(Number(opt.variation_id));
                  if (!newFoodId || !newVariationId) return null;
                  return {
                    food_id: newFoodId,
                    variation_id: newVariationId,
                    option_name: opt.option_name,
                    option_price: opt.option_price,
                    total_stock: opt.total_stock,
                    stock_type: opt.stock_type,
                    sell_count: BigInt(0),
                    created_at: now,
                    updated_at: now,
                  };
                })
                .filter((row): row is NonNullable<typeof row> => row != null),
            });
          }

          // Food tags / nutrition / allergies
          const foodTags = await tx.food_tag.findMany({
            where: { food_id: { in: oldFoodIds } },
          });
          if (foodTags.length) {
            await tx.food_tag.createMany({
              data: foodTags
                .map((row) => {
                  const newFoodId = foodMap.get(Number(row.food_id));
                  if (!newFoodId) return null;
                  return { food_id: newFoodId, tag_id: row.tag_id };
                })
                .filter((row): row is NonNullable<typeof row> => row != null),
            });
          }

          const foodNutrition = await tx.food_nutrition.findMany({
            where: { food_id: { in: oldFoodIds } },
          });
          if (foodNutrition.length) {
            await tx.food_nutrition.createMany({
              data: foodNutrition
                .map((row) => {
                  const newFoodId = foodMap.get(Number(row.food_id));
                  if (!newFoodId) return null;
                  return { food_id: newFoodId, nutrition_id: row.nutrition_id };
                })
                .filter((row): row is NonNullable<typeof row> => row != null),
            });
          }

          const allergies = await tx.allergy_food.findMany({
            where: { food_id: { in: oldFoodIds } },
          });
          if (allergies.length) {
            await tx.allergy_food.createMany({
              data: allergies
                .map((row) => {
                  const newFoodId = foodMap.get(Number(row.food_id));
                  if (!newFoodId) return null;
                  return { food_id: newFoodId, allergy_id: row.allergy_id };
                })
                .filter((row): row is NonNullable<typeof row> => row != null),
            });
          }

          // Food translations
          const foodTranslations = await tx.translations.findMany({
            where: {
              translationable_type: FOOD_TRANSLATION_TYPE,
              translationable_id: { in: oldFoodIds },
            },
          });
          if (foodTranslations.length) {
            await tx.translations.createMany({
              data: foodTranslations
                .map((row) => {
                  const newFoodId = foodMap.get(Number(row.translationable_id));
                  if (!newFoodId) return null;
                  return {
                    translationable_type: FOOD_TRANSLATION_TYPE,
                    translationable_id: newFoodId,
                    locale: row.locale,
                    key: row.key,
                    value: row.value,
                    created_at: now,
                    updated_at: now,
                  };
                })
                .filter((row): row is NonNullable<typeof row> => row != null),
            });
          }
        }
      }

      return {
        vendor,
        restaurant,
        categories_copied,
        addons_copied,
        foods_copied,
      };
    },
    { timeout: 120_000 }
  );

  return {
    source_restaurant_id: sourceRestaurantId,
    vendor_id: Number(result.vendor.id),
    restaurant_id: Number(result.restaurant.id),
    include_menu: includeMenu,
    categories_copied: result.categories_copied,
    addons_copied: result.addons_copied,
    foods_copied: result.foods_copied,
  };
}
