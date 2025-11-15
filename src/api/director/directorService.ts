import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { DirectorDTO, DirectorModel } from '@/api/director/directorModel';
import { UserDirectorCreationDTO, UserDTO } from '@/api/user/userModel';
import { Role } from '@/common/models/role';
import { config } from '@/common/utils/config';
import { logger } from '@/common/utils/serverLogger';

import sendMailTo from '../../common/mailSender/mailSenderService';
import { userService } from '../user/userService';
import { directorRepository } from './directorRepository';

export const directorService = {
  create: async (user: UserDirectorCreationDTO): Promise<UserDTO> => {
    logger.trace('[DirectorService] - [create] - Start');
    logger.trace(`[DirectorService] - [create] - Creating user: ${JSON.stringify(user)}`);

    let hash: string;
    let forcePasswordReset: boolean;
    if (user.password) {
      const { password, ...restUser } = user;
      hash = password;
      user = restUser;
      forcePasswordReset = false;
    } else {
      logger.trace(`[DirectorService] - [create] - Generating random password...`);
      const randomPassword = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
      if (config.app.node_env === 'development') {
        logger.trace(`[DirectorService] - [create] - Random password: ${randomPassword}`);
      }
      forcePasswordReset = true;
      hash = await bcrypt.hash(randomPassword, 10);
    }
    logger.trace(`[DirectorService] - [create] - Creating user...`);

    const createdUser: UserDTO = await userService.create({
      ...user,
      password: hash,
      role: Role.DIRECTOR,
      forcePasswordReset: forcePasswordReset,
    });
    logger.trace(`[DirectorService] - [create] - User created: ${JSON.stringify(createdUser)}`);

    const director = new DirectorModel({
      user: createdUser.id,
      institute: user.institute.id,
    });

    await director.save();

    logger.trace(`[DirectorService] - [create] - Sending email to user ${createdUser.email}...`);
    const token = jwt.sign({ id: createdUser.id }, config.jwt.secret as string, { expiresIn: '12h' });
    sendMailTo({
      to: [createdUser.email],
      subject: 'Bienvenido a AdaptarIA!',
      bodyTemplateName: 'director_welcome',
      templateParams: {
        directorName: createdUser.firstName,
        directorEmail: createdUser.email,
        reset_password_link: `${config.app.frontendUrl}/recoverPassword?token=${token}`,
      },
    });
    logger.trace(`[DirectorService] - [create] - Email sent`);
    logger.trace('[DirectorService] - [create] - End');
    return createdUser;
  },

  findAll: async (): Promise<DirectorDTO[]> => {
    logger.trace('[DirectorService] - [findAll] - Start');
    const directors = await directorRepository.findAll();
    logger.trace(`[DirectorService] - [findAll] - Found ${directors.length} directors`);
    logger.trace('[DirectorService] - [findAll] - End');
    return directors;
  },

  findByInstituteId: async (instituteId: string): Promise<DirectorDTO[]> => {
    logger.trace(`[DirectorService] - [findByInstituteId] - Finding directors for institute: ${instituteId}`);
    const directors = await directorRepository.findByInstituteId(instituteId);
    logger.trace(`[DirectorService] - [findByInstituteId] - Found ${directors.length} directors`);
    return directors;
  },

  getInstituteId: async (directorId: string): Promise<string> => {
    logger.trace('[DirectorService] - [getInstituteId] - Start');
    const id = await directorRepository.getInstituteId(directorId);
    logger.trace(`[DirectorService] - [getInstituteId] - Institute ID: ${id}`);
    logger.trace('[DirectorService] - [getInstituteId] - End');
    return id;
  },
};
