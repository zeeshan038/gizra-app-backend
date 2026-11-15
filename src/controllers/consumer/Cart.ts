import { Request, Response } from 'express';
import prisma from '../../config/database';
import { addMultipleCartSchema, addToCartSchema, updateCartSchema } from '../../schemas/consumer/Cart';
import {
  assertCartFoodSellableNow,
  assertCartFoodStockAvailable,
  CartFoodSellingTimeError,
  CartFoodStockError,
} from '../../utils/consumer/cartFoodSellingTime';
import { cartLineIdentityWhere } from '../../utils/consumer/cartIdentity';
import {
  formatConsumerCartLine,
  formatConsumerCartLines,
  parsePrismaCartRow,
} from '../../utils/consumer/cartLineFormatter';
import {
  assertItemsBelongToRestaurant,
  assertSingleRestaurantCart,
  CartItemRestaurantMismatchError,
  CartRestaurantMismatchError,
} from '../../utils/consumer/cartRestaurantGuard';
import { cartRowOwnedBy, resolveCartSessionFromRequest } from '../../utils/consumer/cartSession';

function cartSellingTimeResponse(err: CartFoodSellingTimeError) {
  return {
    status: false,
    msg: err.message,
    code: 'food_selling_time',
    availability_status: err.availability_status ?? null,
  };
}

function cartStockResponse(err: CartFoodStockError) {
  return {
    status: false,
    msg: err.message,
    code: 'food_stock',
    stock_status: err.stock_status ?? 'out_of_stock',
    current_stock: err.current_stock ?? 0,
  };
}

async function assertFoodLineRules(params: {
  itemId: number;
  itemType: string;
  quantity: number;
  userId: number;
  isGuest: boolean;
  excludeCartId?: bigint;
}) {
  if (String(params.itemType).toLowerCase() !== 'food') return;
  await assertCartFoodSellableNow(params.itemId);
  await assertCartFoodStockAvailable({
    itemId: params.itemId,
    quantity: params.quantity,
    userId: params.userId,
    isGuest: params.isGuest,
    excludeCartId: params.excludeCartId,
  });
}

/**
 * @Description Get all cart items for a user or guest
 * @Route GET /api/consumer/cart
 */
export const getCart = async (req: Request, res: Response): Promise<any> => {
  const session = resolveCartSessionFromRequest(req);
  if ('error' in session) {
    return res.status(session.error.status).json({ status: false, msg: session.error.msg });
  }

  try {
    const carts = await prisma.carts.findMany({
      where: {
        user_id: session.user_id,
        is_guest: session.is_guest,
      },
    });
    const parsed = carts.map(parsePrismaCartRow);
    const data = await formatConsumerCartLines(parsed);
    return res.status(200).json({ status: true, data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Add item to cart
 * @Route POST /api/consumer/cart/add
 */
export const addToCart = async (req: Request, res: Response): Promise<any> => {
  const session = resolveCartSessionFromRequest(req, req.body);
  if ('error' in session) {
    return res.status(session.error.status).json({ status: false, msg: session.error.msg });
  }

  const result = addToCartSchema.validate(req.body, { stripUnknown: true });
  if (result.error) {
    return res.status(400).json({
      status: false,
      msg: result.error.details.map((d: any) => d.message).join(','),
    });
  }

  const body = result.value;
  const itemType = String(body.item_type ?? 'Food');

  try {
    await assertSingleRestaurantCart({
      userId: session.user_id,
      isGuest: session.is_guest,
      restaurantId: Number(body.restaurant_id),
      newItemId: Number(body.item_id),
    });
  } catch (e: unknown) {
    if (e instanceof CartRestaurantMismatchError || e instanceof CartItemRestaurantMismatchError) {
      return res.status(403).json({ status: false, msg: e.message });
    }
    throw e;
  }

  try {
    const existingCartItem = await prisma.carts.findFirst({
      where: cartLineIdentityWhere(
        session.user_id,
        body.item_id,
        itemType,
        session.is_guest,
        body
      ),
    });

    if (existingCartItem) {
      const newQty = Number(existingCartItem.quantity) + Number(body.quantity);
      try {
        await assertFoodLineRules({
          itemId: Number(body.item_id),
          itemType,
          quantity: newQty,
          userId: session.user_id,
          isGuest: session.is_guest,
          excludeCartId: existingCartItem.id,
        });
      } catch (e: unknown) {
        if (e instanceof CartFoodSellingTimeError) {
          return res.status(403).json(cartSellingTimeResponse(e));
        }
        if (e instanceof CartFoodStockError) {
          return res.status(403).json(cartStockResponse(e));
        }
        throw e;
      }

      const cart = await prisma.carts.update({
        where: { id: existingCartItem.id },
        data: { quantity: newQty },
      });
      const data = await formatConsumerCartLine(parsePrismaCartRow(cart));
      return res.status(200).json({
        status: true,
        msg: 'Cart updated successfully',
        data,
      });
    }

    try {
      await assertFoodLineRules({
        itemId: Number(body.item_id),
        itemType,
        quantity: Number(body.quantity) || 1,
        userId: session.user_id,
        isGuest: session.is_guest,
      });
    } catch (e: unknown) {
      if (e instanceof CartFoodSellingTimeError) {
        return res.status(403).json(cartSellingTimeResponse(e));
      }
      if (e instanceof CartFoodStockError) {
        return res.status(403).json(cartStockResponse(e));
      }
      throw e;
    }

    const cart = await prisma.carts.create({
      data: {
        user_id: session.user_id,
        item_id: body.item_id,
        is_guest: session.is_guest,
        item_type: itemType,
        price: body.price,
        quantity: body.quantity,
        add_on_ids: JSON.stringify(body.add_on_ids),
        add_on_qtys: JSON.stringify(body.add_on_qtys),
        add_on_placements: JSON.stringify(body.add_on_placements ?? []),
        variations: JSON.stringify(body.variations),
        variation_options: JSON.stringify(body.variation_options),
      },
    });

    const data = await formatConsumerCartLine(parsePrismaCartRow(cart));
    return res.status(201).json({
      status: true,
      msg: 'Added to cart successfully',
      data,
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Update cart item quantity
 * @Route PUT /api/consumer/cart/update
 */
export const updateCart = async (req: Request, res: Response): Promise<any> => {
  const session = resolveCartSessionFromRequest(req, req.body);
  if ('error' in session) {
    return res.status(session.error.status).json({ status: false, msg: session.error.msg });
  }

  const result = updateCartSchema.validate(req.body, { stripUnknown: true });
  if (result.error) {
    return res.status(400).json({
      status: false,
      msg: result.error.details.map((d: any) => d.message).join(','),
    });
  }

  const { cart_id, quantity } = result.value;

  try {
    const existing = await prisma.carts.findUnique({
      where: { id: BigInt(cart_id) },
    });
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Cart item not found' });
    }
    if (!cartRowOwnedBy(existing, session)) {
      return res.status(403).json({ status: false, msg: 'Forbidden' });
    }

    if (Number(quantity) < 1) {
      await prisma.carts.delete({ where: { id: existing.id } });
      return res.status(200).json({ status: true, msg: 'Cart updated successfully', data: null });
    }

    try {
      await assertFoodLineRules({
        itemId: Number(existing.item_id),
        itemType: String(existing.item_type ?? 'Food'),
        quantity: Number(quantity),
        userId: session.user_id,
        isGuest: session.is_guest,
        excludeCartId: existing.id,
      });
    } catch (e: unknown) {
      if (e instanceof CartFoodSellingTimeError) {
        return res.status(403).json(cartSellingTimeResponse(e));
      }
      if (e instanceof CartFoodStockError) {
        return res.status(403).json(cartStockResponse(e));
      }
      throw e;
    }

    const cart = await prisma.carts.update({
      where: { id: existing.id },
      data: { quantity },
    });

    const data = await formatConsumerCartLine(parsePrismaCartRow(cart));
    return res.status(200).json({
      status: true,
      msg: 'Cart updated successfully',
      data,
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Remove item from cart
 * @Route DELETE /api/consumer/cart/remove-item/:id
 */
export const removeCartItem = async (req: Request, res: Response): Promise<any> => {
  const session = resolveCartSessionFromRequest(req);
  if ('error' in session) {
    return res.status(session.error.status).json({ status: false, msg: session.error.msg });
  }

  try {
    const existing = await prisma.carts.findUnique({
      where: { id: BigInt(req.params.id as string) },
    });
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Cart item not found' });
    }
    if (!cartRowOwnedBy(existing, session)) {
      return res.status(403).json({ status: false, msg: 'Forbidden' });
    }
    await prisma.carts.delete({ where: { id: existing.id } });
    return res.status(200).json({ status: true, msg: 'Removed' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

type AddMultipleLine = {
  item_id: number;
  model?: string;
  item_type?: string;
  price: number;
  quantity: number;
  add_on_ids?: number[];
  add_on_qtys?: number[];
  add_on_placements?: unknown[];
  variations?: unknown[];
  variation_options?: unknown[];
};

/**
 * @Description Replace cart with several items (re-order)
 * @Route POST /api/consumer/cart/add-multiple
 */
export const addMultipleToCart = async (req: Request, res: Response): Promise<any> => {
  const session = resolveCartSessionFromRequest(req, req.body);
  if ('error' in session) {
    return res.status(session.error.status).json({ status: false, msg: session.error.msg });
  }

  const result = addMultipleCartSchema.validate(req.body, { stripUnknown: true });
  if (result.error) {
    return res.status(400).json({
      status: false,
      msg: result.error.details.map((d: { message: string }) => d.message).join(','),
    });
  }

  const restaurantId = Number(result.value.restaurant_id);
  const items = result.value.items as AddMultipleLine[];

  try {
    await assertItemsBelongToRestaurant(
      items.map((i) => Number(i.item_id)),
      restaurantId
    );
  } catch (e: unknown) {
    if (e instanceof CartItemRestaurantMismatchError) {
      return res.status(403).json({ status: false, msg: e.message });
    }
    throw e;
  }

  const qtyByItemId = new Map<number, number>();
  for (const single of items) {
    const id = Number(single.item_id);
    const prev = qtyByItemId.get(id) ?? 0;
    qtyByItemId.set(id, prev + (Number(single.quantity) || 1));
  }

  try {
    for (const single of items) {
      const itemType = single.item_type ?? single.model ?? 'Food';
      if (String(itemType).toLowerCase() !== 'food') continue;
      try {
        await assertCartFoodSellableNow(Number(single.item_id));
      } catch (e: unknown) {
        if (e instanceof CartFoodSellingTimeError) {
          return res.status(403).json(cartSellingTimeResponse(e));
        }
        throw e;
      }
    }

    for (const [itemId, totalQty] of qtyByItemId) {
      try {
        await assertCartFoodStockAvailable({
          itemId,
          quantity: totalQty,
          userId: session.user_id,
          isGuest: session.is_guest,
        });
      } catch (e: unknown) {
        if (e instanceof CartFoodStockError) {
          return res.status(403).json(cartStockResponse(e));
        }
        throw e;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.carts.deleteMany({
        where: { user_id: session.user_id, is_guest: session.is_guest },
      });
      for (const single of items) {
        const itemType = single.item_type ?? single.model ?? 'Food';
        await tx.carts.create({
          data: {
            user_id: session.user_id,
            item_id: single.item_id,
            is_guest: session.is_guest,
            item_type: itemType,
            price: single.price,
            quantity: single.quantity,
            add_on_ids: JSON.stringify(single.add_on_ids ?? []),
            add_on_qtys: JSON.stringify(single.add_on_qtys ?? []),
            add_on_placements: JSON.stringify(single.add_on_placements ?? []),
            variations: JSON.stringify(single.variations ?? []),
            variation_options: JSON.stringify(single.variation_options ?? []),
          },
        });
      }
    });

    const carts = await prisma.carts.findMany({
      where: { user_id: session.user_id, is_guest: session.is_guest },
    });
    const data = await formatConsumerCartLines(carts.map(parsePrismaCartRow));
    return res.status(200).json({ status: true, data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Clear entire cart
 * @Route DELETE /api/consumer/cart/clear/:user_id
 */
export const clearCart = async (req: Request, res: Response): Promise<any> => {
  const session = resolveCartSessionFromRequest(req);
  if ('error' in session) {
    return res.status(session.error.status).json({ status: false, msg: session.error.msg });
  }

  const pathUserId = Number(req.params.user_id);
  if (pathUserId !== session.user_id) {
    return res.status(403).json({ status: false, msg: 'Forbidden' });
  }

  try {
    await prisma.carts.deleteMany({
      where: {
        user_id: session.user_id,
        is_guest: session.is_guest,
      },
    });
    return res.status(200).json({ status: true, msg: 'Cart cleared completely' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};