import Joi from 'joi';

export const createAddressSchema = Joi.object({
  contact_person_name: Joi.string().required(),
  address_type: Joi.string().required(),
  contact_person_number: Joi.string().required(),
  address: Joi.string().required(),
  longitude: Joi.alternatives(Joi.string(), Joi.number()).required(),
  latitude: Joi.alternatives(Joi.string(), Joi.number()).required(),
  floor: Joi.string().optional().allow(''),
  road: Joi.string().optional().allow(''),
  house: Joi.string().optional().allow(''),
  zone_id: Joi.number().optional(),
});

export const updateAddressSchema = createAddressSchema;
