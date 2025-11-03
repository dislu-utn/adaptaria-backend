export function connector_sync(entity: string, entity_id: string, method: string): Promise<void> {
  // if self_triggered: do nothing
  return Promise.resolve();
}
