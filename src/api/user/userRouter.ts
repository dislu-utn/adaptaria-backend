import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { NextFunction, Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import {
  GetUserSchema,
  UpdateUserProfileSchema,
  UpdateUserRoleSchema,
  UserDTO,
  UserDTOSchema,
} from '@/api/user/userModel';
import { userService } from '@/api/user/userService';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { sessionMiddleware, SessionRequest } from '@/common/middleware/session';
import { ApiError } from '@/common/models/apiError';
import { ApiResponse, ResponseStatus } from '@/common/models/apiResponse';
import { handleApiResponse, validateRequest } from '@/common/utils/httpHandlers';
import { logger } from '@/common/utils/serverLogger';
const UNAUTHORIZED = new ApiError('Unauthorized', StatusCodes.UNAUTHORIZED);
import { InvalidCredentialsError } from '../auth/authModel';
import { connector_sync } from '../connector/connector_sync';

export const userRegistry = new OpenAPIRegistry();
userRegistry.register('User', UserDTOSchema);

export const userRouter: Router = (() => {
  const router = express.Router();

  userRegistry.registerPath({
    method: 'get',
    path: '/users',
    tags: ['User'],
    responses: createApiResponse(z.array(UserDTOSchema), 'Success'),
  });

  userRegistry.registerPath({
    method: 'get',
    path: '/users/{id}',
    tags: ['User'],
    request: { params: GetUserSchema.shape.params },
    responses: createApiResponse(UserDTOSchema, 'Success'),
  });

  userRegistry.registerPath({
    method: 'get',
    path: '/users/me',
    tags: ['User'],
    responses: createApiResponse(UserDTOSchema, 'Success'),
  });

  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      logger.trace('[UserRouter] - [/] - Start');
      logger.trace('[UserRouter] - [/] - Retrieving users...');
      const users: UserDTO[] = await userService.findAll();
      logger.trace(`[UserRouter] - [/] - ${users.length} users found}. Sending response`);
      const apiResponse = new ApiResponse(
        ResponseStatus.Success,
        'Users retrieved successfully',
        users,
        StatusCodes.OK
      );
      handleApiResponse(apiResponse, res);
    } catch (error) {
      logger.error(`[UserRouter] - [/] - Error: ${error}`);
      const apiError = new ApiError('Failed to retrieve users', StatusCodes.INTERNAL_SERVER_ERROR, error);
      return next(apiError);
    } finally {
      logger.trace('[UserRouter] - [/] - End');
    }
  });

  router.get('/me', async (req: SessionRequest, res: Response, next: NextFunction) => {
    logger.trace('[UserRouter] - [/me] - Start');
    logger.trace('[UserRouter] - [/me] - Retrieving current user...');
    try {
      if (!req.sessionContext?.user?.id) {
        logger.trace('[UserRouter] - [/me] - Session context is missing, sending error response');
        return next(new ApiError('Session context is missing', StatusCodes.UNAUTHORIZED));
      }
      const user: UserDTO = await userService.findById(req.sessionContext?.user?.id);
      logger.trace(`[UserRouter] - [/me] - User found: ${JSON.stringify(user)}. Sending response`);
      const apiResponse = new ApiResponse(ResponseStatus.Success, 'User retrieved successfully', user, StatusCodes.OK);
      handleApiResponse(apiResponse, res);
    } catch (e) {
      logger.error(`[UserRouter] - [/me] - Error: ${e}`);
      return next(new ApiError('Failed to retrieve user', StatusCodes.INTERNAL_SERVER_ERROR, e));
    } finally {
      logger.trace('[UserRouter] - [/me] - End');
    }
  });

  router.get('/:id', validateRequest(GetUserSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.trace('[UserRouter] - [/:id] - Start');
      const userReq = GetUserSchema.parse({ params: req.params });
      logger.trace(`[UserRouter] - [/:id] - Retrieving user with id: ${userReq.params.id}...`);
      const user: UserDTO = await userService.findById(userReq.params.id.toString());
      logger.trace(`[UserRouter] - [/:id] - User found: ${JSON.stringify(user)}. Sending response`);
      const apiResponse = new ApiResponse(ResponseStatus.Success, 'User retrieved successfully', user, StatusCodes.OK);
      handleApiResponse(apiResponse, res);
    } catch (e) {
      logger.error(`[UserRouter] - [/:id] - Error: ${e}`);
      if (e instanceof InvalidCredentialsError) {
        logger.error(`[UserRouter] - [/:id] - User not found`);
        const apiError = new ApiError('User not found', StatusCodes.NOT_FOUND, e);
        return next(apiError);
      }
      logger.error(`[UserRouter] - [/:id] - Failed to retrieve user`);
      return next(new ApiError('Failed to retrieve user', StatusCodes.INTERNAL_SERVER_ERROR, e));
    } finally {
      logger.trace('[UserRouter] - [/:id] - End');
    }
  });

  userRegistry.registerPath({
    method: 'patch',
    path: '/users/me',
    tags: ['User'],
    request: {
      body: { content: { 'application/json': { schema: UpdateUserProfileSchema.shape.body } }, description: '' },
    },
    responses: createApiResponse(UserDTOSchema, 'Success'),
  });

  router.patch(
    '/me',
    sessionMiddleware,
    validateRequest(UpdateUserProfileSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const userId = req.sessionContext?.user?.id;

        if (!userId) {
          return next(UNAUTHORIZED);
        }

        const { profilePicture } = req.body;

        // Actualizar solo los campos proporcionados
        const updatedUser = await userService.updateUserProfile(userId, profilePicture);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'User profile updated successfully',
          updatedUser,
          StatusCodes.OK
        );

        connector_sync('user', updatedUser.id, 'update');
        handleApiResponse(apiResponse, res);
      } catch (error) {
        const apiError = new ApiError('Failed to update user profile', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  userRegistry.registerPath({
    method: 'patch',
    path: '/users/:userId/role',
    tags: ['User'],
    request: {
      params: UpdateUserRoleSchema.shape.params,
      body: { content: { 'application/json': { schema: UpdateUserRoleSchema.shape.body } }, description: '' },
    },
    responses: createApiResponse(UserDTOSchema, 'Success'),
  });

  router.patch(
    '/:userId/role',
    sessionMiddleware,
    validateRequest(UpdateUserProfileSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const directorId = req.sessionContext?.user?.id;

        if (!directorId) {
          return next(UNAUTHORIZED);
        }

        const { userId } = req.params;
        const { newRole } = req.body;

        // Actualizar solo los campos proporcionados
        const updatedUserDTO = await userService.updateUserRole(userId, newRole);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'User role updated successfully',
          updatedUserDTO,
          StatusCodes.OK
        );
        connector_sync('user', updatedUserDTO.id, 'update');

        handleApiResponse(apiResponse, res);
      } catch (error) {
        const apiError = new ApiError('Failed to update user profile', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  return router;
})();
