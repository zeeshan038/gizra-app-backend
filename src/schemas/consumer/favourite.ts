import Joi from 'joi';

/** Add favourite food OR restaurant (not both). Mirrors PHP WishlistController@add_to_wishlist */
export const addFavouriteSchema = Joi.object({
  food_id: Joi.number().optional(),
  restaurant_id: Joi.number().optional(),
})
  .or('food_id', 'restaurant_id')
  .custom((value, helpers) => {
    if (value.food_id != null && value.restaurant_id != null) {
      return helpers.error('any.custom', {
        message: 'Cannot add both food and restaurant at the same time',
      });
    }
    return value;
  })
  .messages({
    'object.missing': 'Either food_id or restaurant_id is required',
  });

/** Remove favourite food OR restaurant */
export const removeFavouriteSchema = Joi.object({
  food_id: Joi.number().optional(),
  restaurant_id: Joi.number().optional(),
})
  .or('food_id', 'restaurant_id')
  .messages({
    'object.missing': 'Either food_id or restaurant_id is required',
  });

/** GET /consumer/favourites/list — Figma tabs + search bar */
export const listFavouritesQuerySchema = Joi.object({
  type: Joi.string().valid('food', 'restaurant', 'all').default('all'),
  search: Joi.string().optional().allow(''),
});
