export type ChatOwnerRole = 'customer' | 'vendor' | 'delivery_man';

export function fcmSenderTypeForRole(role: ChatOwnerRole): 'user' | 'vendor' | 'delivery_man' {
  if (role === 'customer') return 'user';
  return role;
}

export function dbSenderTypeForRole(role: ChatOwnerRole): string {
  return role === 'customer' ? 'customer' : role;
}
