import { Request, Response } from 'express';
import Joi from 'joi';
import { initRegistrationStorage, type RegistrationStorageRole } from '../../utils/accountStorage';

const initSchema = Joi.object({
  role: Joi.string().valid('vendor', 'deliveryman').required().messages({
    'any.required': 'role is required',
    'any.only': 'role must be vendor or deliveryman',
  }),
});

/**
 * Pre-register storage: allocate cloudflareId + R2 prefixes before account creation.
 * @Route POST /api/storage/registration-init
 */
export const registrationInit = async (req: Request, res: Response): Promise<any> => {
  const validated = initSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { role } = validated.value as { role: RegistrationStorageRole };

  try {
    const data = await initRegistrationStorage(role);
    return res.status(200).json({
      status: true,
      msg: 'Upload prefix ready. Upload files then pass cloudflare_id on register.',
      data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to init registration storage';
    return res.status(500).json({ status: false, msg: message });
  }
};
