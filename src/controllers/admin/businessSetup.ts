import { Request, Response } from 'express';
import {
  adminBusinessSetupTabQuerySchema,
  adminUpdateBusinessSchema,
  adminUpdateCustomerSchema,
  adminUpdateDeliverymanSchema,
  adminUpdateDisbursementSchema,
  adminUpdateLandingSchema,
  adminUpdateLanguageSchema,
  adminUpdateMaintenanceSchema,
  adminUpdateOrderSchema,
  adminUpdatePrioritySchema,
  adminUpdateRefundSchema,
  adminUpdateRestaurantSchema,
} from '../../schemas/admin/BusinessSetup';
import {
  getBusinessSetup,
  updateBusinessTab,
  updateCustomerTab,
  updateDeliverymanTab,
  updateDisbursementTab,
  updateLandingTab,
  updateLanguageTab,
  updateMaintenance,
  updateOrderTab,
  updatePriorityTab,
  updateRefundTab,
  updateRestaurantTab,
} from '../../utils/admin/businessSetup/service';

type Handler = (req: Request, res: Response) => Promise<any>;

function handleUpdate(schema: { validate: Function }, updater: (body: any) => Promise<void>): Handler {
  return async (req, res) => {
    const validated = schema.validate(req.body, { stripUnknown: true });
    if (validated.error) {
      return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
    }
    try {
      await updater(validated.value);
      return res.status(200).json({ status: true, msg: 'Successfully updated' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      return res.status(400).json({ status: false, msg });
    }
  };
}

/**
 * @Route GET /api/admin/business-setup
 * @Query tab?=all|business|priority|order|...
 */
export const getAdminBusinessSetup: Handler = async (req, res) => {
  const validated = adminBusinessSetupTabQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await getBusinessSetup(validated.value.tab);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PUT /api/admin/business-setup/maintenance
 */
export const updateAdminMaintenance = handleUpdate(adminUpdateMaintenanceSchema, updateMaintenance);

/**
 * @Route PUT /api/admin/business-setup/business
 */
export const updateAdminBusiness = handleUpdate(adminUpdateBusinessSchema, updateBusinessTab);

/**
 * @Route PUT /api/admin/business-setup/order
 */
export const updateAdminOrderSetup = handleUpdate(adminUpdateOrderSchema, updateOrderTab);

/**
 * @Route PUT /api/admin/business-setup/restaurant
 */
export const updateAdminRestaurantSetup = handleUpdate(adminUpdateRestaurantSchema, updateRestaurantTab);

/**
 * @Route PUT /api/admin/business-setup/deliveryman
 */
export const updateAdminDeliverymanSetup = handleUpdate(adminUpdateDeliverymanSchema, updateDeliverymanTab);

/**
 * @Route PUT /api/admin/business-setup/customer
 */
export const updateAdminCustomerSetup = handleUpdate(adminUpdateCustomerSchema, updateCustomerTab);

/**
 * @Route PUT /api/admin/business-setup/priority
 */
export const updateAdminPrioritySetup = handleUpdate(adminUpdatePrioritySchema, updatePriorityTab);

/**
 * @Route PUT /api/admin/business-setup/disbursement
 */
export const updateAdminDisbursementSetup = handleUpdate(
  adminUpdateDisbursementSchema,
  updateDisbursementTab
);

/**
 * @Route PUT /api/admin/business-setup/landing
 */
export const updateAdminLandingSetup = handleUpdate(adminUpdateLandingSchema, updateLandingTab);

/**
 * @Route PUT /api/admin/business-setup/refund
 */
export const updateAdminRefundSetup = handleUpdate(adminUpdateRefundSchema, updateRefundTab);

/**
 * @Route PUT /api/admin/business-setup/language
 */
export const updateAdminLanguageSetup = handleUpdate(adminUpdateLanguageSchema, updateLanguageTab);
