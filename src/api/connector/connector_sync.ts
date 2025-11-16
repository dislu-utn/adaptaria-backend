import axios from 'axios';

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
): Promise<Response | undefined> {
  const connectorUrl = process.env.CONNECTOR_URL || 'http://localhost:5000';

  logger.info(`[ConnectorSync] - Sync fetch ${connectorUrl}/sync`);
  if (!institution_id) {
    logger.warn('[ConnectorSync] - No institution_id provided, skipping sync');
    return;
  }

  try {
    const response = await axios.post(`${connectorUrl}/sync`, {
      institution_id: institution_id,
      entity: entity,
      entity_id: entity_id,
      origin: 'adaptaria',
      method: method,
    });

    if (response.status >= 400) {
      logger.warn(
        `[ConnectorSync] - Sync failed with status ${response.status} for ${entity} ${entity_id}. ` +
          `Reason: ${response.statusText}. Details: ${JSON.stringify(response.data)}`
      );
    } else {
      logger.trace(
        `[ConnectorSync] - Synced ${entity} ${entity_id} with method ${method} for institution ${institution_id}`
      );
    }

    return response as any;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code,
      };
      logger.error(`[ConnectorSync] - Failed to sync ${entity} ${entity_id}: ${JSON.stringify(errorDetails, null, 2)}`);
    } else {
      logger.error(`[ConnectorSync] - Failed to sync ${entity} ${entity_id}: ${error}`);
    }
    return undefined;
  }
}
