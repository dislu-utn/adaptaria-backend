import './cron';

import { logger } from '@/common/utils/serverLogger';
import { app } from '@/server';

import { buildTransporter, initTransporter } from './common/mailSender/mailSenderService';
import { config } from './common/utils/config';
import { initAdminUser } from './common/utils/initAdminUser';
import { connectToMongoDB } from './common/utils/mongodb';

const server = app.listen(config.app.port, () => {
  const { port, host, node_env } = config.app;
  logger.info(`Server (${node_env}) running on port http://${host}:${port}`);
});

connectToMongoDB(config.mongodb.uri)
  .then(() => {
    logger.info('MongoDB connected');
    return initAdminUser();
  })
  .then(() => logger.info('Admin user initialization complete'))
  .catch((ex) => logger.error(`Error during initialization: ${(ex as Error).message}`));

initTransporter(buildTransporter());

const onCloseSignal = () => {
  logger.info('sigint received, shutting down');
  server.close(() => {
    logger.info('server closed');
    process.exit();
  });
  setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on('SIGINT', onCloseSignal);
process.on('SIGTERM', onCloseSignal);
