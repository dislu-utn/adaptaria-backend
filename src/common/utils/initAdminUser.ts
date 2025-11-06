import bcrypt from 'bcrypt';

import { UserModel } from '@/api/user/userModel';
import { Role } from '@/common/models/role';
import { logger } from '@/common/utils/serverLogger';

/**
 * Inicializa un usuario administrador (director) por defecto si no existe
 * Email: dislu.utn@gmail.com
 * Password: dislu
 */
export async function initAdminUser(): Promise<void> {
  try {
    const adminEmail = 'dislu.utn@gmail.com';

    // Verificar si el usuario ya existe
    const existingUser = await UserModel.findOne({ email: adminEmail }).exec();

    if (existingUser) {
      logger.info(`[INIT] Admin user ${adminEmail} already exists, skipping creation`);
      return;
    }

    logger.info(`[INIT] Creating default admin user: ${adminEmail}`);

    // Hashear la contraseña "dislu"
    const hashedPassword = await bcrypt.hash('dislu', 10);

    // Crear el usuario
    const adminUser = new UserModel({
      firstName: 'Dislu',
      lastName: 'Administrator',
      email: adminEmail,
      password: hashedPassword,
      role: Role.DIRECTOR,
      document: {
        type: 'GENERIC',
        number: '00000000',
      },
      forcePasswordReset: false,
      nextDateSurvey: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
    });

    await adminUser.save();
    logger.info(`[INIT] Admin user created with ID: ${adminUser._id}`);

    logger.info(`[INIT] ✓ Admin user ${adminEmail} initialized successfully`);
    logger.info(`[INIT] You can login with email: ${adminEmail} and password: dislu`);
  } catch (error) {
    logger.error(`[INIT] Error initializing admin user: ${error}`);
    throw error;
  }
}
