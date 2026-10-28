/** GA-01: a global off policy, independent of identity, school and environment.
 * Future school policies must keep this default and require a separate review.
 * There is deliberately no enabling override, queue, transport or SDK here.
 */
export function isProductAnalyticsEnabled(): false {
  return false;
}

/** Preserve caller contracts while discarding data without logging or storage. */
export function discardProductEvent(event: unknown): void {
  void event;
}
