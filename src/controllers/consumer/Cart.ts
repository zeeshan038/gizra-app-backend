import { Request, Response } from 'express';
import prisma from '../../config/database';
import { addMultipleCartSchema, addToCartSchema, updateCartSchema } from '../../schemas/consumer/Cart';

/**
 * @Description Get all cart items for a user or guest
 * @Route GET /api/consumer/cart
 * @Access Public
 */
export const getCart = async (req: Request, res: Response): Promise<any> => {
    const isGuestSession = req.user?.isGuest === true;
    const is_guest = req.query.is_guest === 'true' || isGuestSession;
    let user_id;

    if (is_guest) {
        user_id = isGuestSession
            ? Number(req.user?.id)
            : req.query.guest_id
              ? Number(req.query.guest_id)
              : null;
        if (!user_id) return res.status(400).json({ status: false, msg: 'guest_id is required' });
    } else {
        user_id = Number(req.user?.id);
        if (!user_id) return res.status(401).json({ status: false, msg: 'Unauthorized' });
    }

    try {
        const carts = await prisma.carts.findMany({
            where: {
                user_id: user_id,
                is_guest: is_guest
            }
        });

        // Parse JSON strings back to arrays/objects for the response
        const mappedCarts = carts.map(cart => ({
            ...cart,
            id: cart.id.toString(),
            user_id: cart.user_id?.toString() || null,
            item_id: cart.item_id?.toString() || null,
            price: Number(cart.price),
            add_on_ids: cart.add_on_ids ? JSON.parse(cart.add_on_ids) : [],
            add_on_qtys: cart.add_on_qtys ? JSON.parse(cart.add_on_qtys) : [],
            variations: cart.variations ? JSON.parse(cart.variations) : [],
            variation_options: cart.variation_options ? JSON.parse(cart.variation_options) : []
        }));

        return res.status(200).json({ status: true, data: mappedCarts });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

/**
 * @Description Add item to cart
 * @Route POST /api/consumer/cart
 * @Access Public
 */
export const addToCart = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;
    
    const isGuestSession = req.user?.isGuest === true;
    const is_guest = Boolean(payload.is_guest) || isGuestSession;

    let user_id;
    if (is_guest) {
        user_id = isGuestSession ? Number(req.user?.id) : Number(payload.guest_id);
        if (!user_id) return res.status(400).json({ status: false, msg: 'guest_id is required for guest users' });
    } else {
        user_id = Number(req.user?.id);
        if (!user_id) return res.status(401).json({ status: false, msg: 'Unauthorized' });
    }

    const result = addToCartSchema.validate(payload, { stripUnknown: true });
    
    if (result.error) {
        return res.status(400).json({ 
            status: false, 
            msg: result.error.details.map((d: any) => d.message).join(',') 
        });
    }

    try {
        // Check if item already exists in cart with same variations
        const existingCartItem = await prisma.carts.findFirst({
            where: {
                user_id: user_id,
                item_id: payload.item_id,
                is_guest: is_guest,
                variations: JSON.stringify(payload.variations)
            }
        });

        if (existingCartItem) {
            return res.status(400).json({ status: false, msg: 'Item with these variations already exists in cart' });
        } else {
            // Create new cart item
            const cart = await prisma.carts.create({
                data: {
                    user_id: user_id,
                    item_id: payload.item_id,
                    is_guest: is_guest,
                    item_type: payload.item_type,
                    price: payload.price,
                    quantity: payload.quantity,
                    add_on_ids: JSON.stringify(payload.add_on_ids),
                    add_on_qtys: JSON.stringify(payload.add_on_qtys),
                    variations: JSON.stringify(payload.variations),
                    variation_options: JSON.stringify(payload.variation_options)
                }
            });

            const mappedCart = {
                ...cart,
                id: cart.id.toString(),
                user_id: cart.user_id?.toString() || null,
                item_id: cart.item_id?.toString() || null,
                price: Number(cart.price),
                add_on_ids: cart.add_on_ids ? JSON.parse(cart.add_on_ids) : [],
                add_on_qtys: cart.add_on_qtys ? JSON.parse(cart.add_on_qtys) : [],
                variations: cart.variations ? JSON.parse(cart.variations) : [],
                variation_options: cart.variation_options ? JSON.parse(cart.variation_options) : []
            };

            return res.status(201).json({ 
                status: true, 
                msg: 'Added to cart successfully',
                data: mappedCart 
            });
        }
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};


/**
 * @Description Update cart item quantity
 * @Route PUT /api/consumer/cart
 * @Access Public
 */
export const updateCart = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;
    const result = updateCartSchema.validate(payload);
    
    if (result.error) {
        return res.status(400).json({ status: false, msg: result.error.details.map((d: any) => d.message).join(',') });
    }

    try {
        const cart = await prisma.carts.update({
            where: { id: BigInt(payload.cart_id) },
            data: { quantity: payload.quantity }
        });

        const mappedCart = {
            ...cart,
            id: cart.id.toString(),
            user_id: cart.user_id?.toString() || null,
            item_id: cart.item_id?.toString() || null,
            price: Number(cart.price),
            add_on_ids: cart.add_on_ids ? JSON.parse(cart.add_on_ids) : [],
            add_on_qtys: cart.add_on_qtys ? JSON.parse(cart.add_on_qtys) : [],
            variations: cart.variations ? JSON.parse(cart.variations) : [],
            variation_options: cart.variation_options ? JSON.parse(cart.variation_options) : []
        };

        return res.status(200).json({ 
            status: true, 
            msg: 'Cart updated successfully',
            data: mappedCart 
        });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

/**
 * @Description Remove item from cart
 * @Route DELETE /api/consumer/cart/:id
 * @Access Public
 */
export const removeCartItem = async (req: Request, res: Response): Promise<any> => {
    try {
        await prisma.carts.delete({
            where: { id: BigInt(req.params.id as string) }
        });
        return res.status(200).json({ status: true, msg: 'Item removed from cart' });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

function mapCartRow(cart: {
  id: bigint;
  user_id: unknown;
  item_id: unknown;
  price: number;
  add_on_ids: string | null;
  add_on_qtys: string | null;
  variations: string | null;
  variation_options: string | null;
  [key: string]: unknown;
}) {
  return {
    ...cart,
    id: cart.id.toString(),
    user_id: cart.user_id != null ? String(cart.user_id) : null,
    item_id: cart.item_id != null ? String(cart.item_id) : null,
    price: Number(cart.price),
    add_on_ids: cart.add_on_ids ? JSON.parse(cart.add_on_ids) : [],
    add_on_qtys: cart.add_on_qtys ? JSON.parse(cart.add_on_qtys) : [],
    variations: cart.variations ? JSON.parse(cart.variations) : [],
    variation_options: cart.variation_options ? JSON.parse(cart.variation_options) : [],
  };
}

/**
 * @Description Add several items in one request (PHP POST /api/v1/customer/cart/add-multiple)
 * @Route POST /api/consumer/cart/add-multiple
 * @Access Consumer
 */
export const addMultipleToCart = async (req: Request, res: Response): Promise<any> => {
  const payload = req.body;
  const isGuestSession = req.user?.isGuest === true;
  const is_guest = Boolean(payload.is_guest) || isGuestSession;
  let user_id: number | null;
  if (is_guest) {
    user_id = isGuestSession ? Number(req.user?.id) : Number(payload.guest_id);
    if (!user_id) return res.status(400).json({ status: false, msg: 'guest_id is required for guest users' });
  } else {
    user_id = Number(req.user?.id);
    if (!user_id) return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const result = addMultipleCartSchema.validate(payload, { stripUnknown: true });
  if (result.error) {
    return res.status(400).json({
      status: false,
      msg: result.error.details.map((d: { message: string }) => d.message).join(','),
    });
  }

  const items = result.value.item_list as Array<{
    item_id: number;
    model?: string;
    item_type?: string;
    price: number;
    quantity: number;
    add_on_ids?: number[];
    add_on_qtys?: number[];
    variations?: unknown[];
    variation_options?: unknown[];
  }>;

  try {
    for (const single of items) {
      const itemType = single.item_type ?? single.model ?? 'Food';
      const existing = await prisma.carts.findFirst({
        where: {
          user_id,
          item_id: single.item_id,
          is_guest,
          variations: JSON.stringify(single.variations ?? []),
        },
      });
      if (existing) {
        return res.status(403).json({ status: false, msg: 'Item already exists' });
      }
      await prisma.carts.create({
        data: {
          user_id,
          item_id: single.item_id,
          is_guest,
          item_type: itemType,
          price: single.price,
          quantity: single.quantity,
          add_on_ids: JSON.stringify(single.add_on_ids ?? []),
          add_on_qtys: JSON.stringify(single.add_on_qtys ?? []),
          variations: JSON.stringify(single.variations ?? []),
          variation_options: JSON.stringify(single.variation_options ?? []),
        },
      });
    }

    const carts = await prisma.carts.findMany({
      where: { user_id, is_guest },
    });
    return res.status(200).json({ status: true, data: carts.map(mapCartRow) });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Clear entirely empty cart
 * @Route DELETE /api/consumer/cart/clear/:user_id
 * @Access Public
 */
export const clearCart = async (req: Request, res: Response): Promise<any> => {
    const is_guest = req.query.is_guest === 'true';
    
    try {
        await prisma.carts.deleteMany({
            where: { 
                user_id: Number(req.params.user_id),
                is_guest: is_guest
            }
        });
        return res.status(200).json({ status: true, msg: 'Cart cleared completely' });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};
