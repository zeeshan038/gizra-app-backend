/** Thrown when driving distance cannot be resolved for billing / restrictions. */
export class DeliveryDistanceUnavailableError extends Error {
  readonly code = 'DELIVERY_DISTANCE_UNAVAILABLE';
  readonly retryable = true;
  readonly statusCode = 503;

  constructor(
    message = 'Driving distance is temporarily unavailable. Please retry in a moment.'
  ) {
    super(message);
    this.name = 'DeliveryDistanceUnavailableError';
  }
}

export function isDeliveryDistanceUnavailableError(
  err: unknown
): err is DeliveryDistanceUnavailableError {
  return err instanceof DeliveryDistanceUnavailableError;
}
