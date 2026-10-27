import { roundMoney } from '../vendor/walletHelpers';

/** Cash held from COD deliveries reduces what the driver can withdraw (legacy PHP profile). */
export function computeDeliveryManWithdrawableBalance(input: {
  total_earning: number;
  total_withdrawn: number;
  pending_withdraw: number;
  collected_cash: number;
}): number {
  const raw =
    input.total_earning -
    input.total_withdrawn -
    input.pending_withdraw -
    input.collected_cash;
  return roundMoney(Math.max(0, raw));
}
