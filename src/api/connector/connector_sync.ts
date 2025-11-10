import { logger } from '@/common/utils/serverLogger';

/**
 * Sincroniza cambios desde Adaptaria hacia el Connector
 * El Connector luego propagará los cambios a Dislu
 *
 * @param institution_id - ID de la institución (MongoDB ObjectId)
 * @param entity - Tipo de entidad (user, course, subject, content, etc.)
 * @param entity_id - ID de la entidad
 * @param method - Método de sincronización (create, update, sync)
 */
export async function connector_sync(
  institution_id: string,
  entity: string,
  entity_id: string,
  method: string
): Promise<void> {
  const connectorUrl = process.env.CONNECTOR_URL || 'http://localhost:5000/';

  if (!institution_id) {
    logger.warn('[ConnectorSync] - No institution_id provided, skipping sync');
    return;
  }

  try {
    const response = await fetch(connectorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        institution_id: institution_id,
        entity: entity,
        entity_id: entity_id,
        origin: 'adaptaria',
        method: method,
      }),
    });
    if (!response.ok) {
      logger.warn(`[ConnectorSync] - Sync failed with status ${response.status} for ${entity} ${entity_id}`);
    } else {
      logger.trace(
        `[ConnectorSync] - Synced ${entity} ${entity_id} with method ${method} for institution ${institution_id}`
      );
    }
  } catch (error) {
    logger.error(`[ConnectorSync] - Failed to sync ${entity} ${entity_id}: ${error}`);
    // Don't throw the error to avoid breaking the main flow
  }
}
