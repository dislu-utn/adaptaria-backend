import './passport';

import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { NextFunction, Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JsonWebTokenError } from 'jsonwebtoken';
import passport from 'passport';
import { z } from 'zod';

import { SessionToken, SessionTokenSchema, UserLoginSchema } from '@/api/user/userModel';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { sessionMiddleware, SessionRequest } from '@/common/middleware/session';
import { ApiError } from '@/common/models/apiError';
import { ApiResponse, ResponseStatus } from '@/common/models/apiResponse';
import { config } from '@/common/utils/config';
import { handleApiResponse, validateRequest } from '@/common/utils/httpHandlers';
import { logger } from '@/common/utils/serverLogger';

import {
  InvalidCredentialsError,
  PasswordChangeRequiredError,
  PasswordNotSecureError,
  PasswordResetSchema,
  PasswordsDoNotMatchError,
  PasswordSetSchema,
} from './authModel';
import { authService } from './authService';

export const authRegistry = new OpenAPIRegistry();

authRegistry.register('Auth', UserLoginSchema);

export const UNAUTHORIZED = new ApiError('Unauthorized', StatusCodes.UNAUTHORIZED);
export const JWT_MISSING = new ApiError('JWT missing', StatusCodes.NOT_ACCEPTABLE);
export const INVALID_CREDENTIALS = new ApiError('Invalid credentials', StatusCodes.UNAUTHORIZED);
export const UNEXPECTED_ERROR = new ApiError('An unexpected error occurred', StatusCodes.INTERNAL_SERVER_ERROR);
export const PASSWORD_NOT_SECURE = new ApiError('Password not secure', StatusCodes.OK);
export const PASSWORDS_DO_NOT_MATCH = new ApiError('Passwords do not match', StatusCodes.OK);

export const authRouter: Router = (() => {
  const router = express.Router();

  authRegistry.registerPath({
    method: 'post',
    path: '/auth',
    tags: ['Authentication'],
    request: { body: { content: { 'application/json': { schema: UserLoginSchema.shape.body } }, description: '' } },
    responses: createApiResponse(SessionTokenSchema, 'Success'),
  });

  authRegistry.registerPath({
    method: 'delete',
    path: '/auth',
    tags: ['Authentication'],
    responses: createApiResponse(z.object({}), 'Success'),
  });

  authRegistry.registerPath({
    method: 'post',
    path: '/auth/setPassword',
    tags: ['PasswordSet'],
    request: { body: { content: { 'application/json': { schema: PasswordSetSchema.shape.body } }, description: '' } },
    responses: createApiResponse(z.object({}), 'Success'),
  });

  authRegistry.registerPath({
    method: 'post',
    path: '/auth/passwordRecovery',
    tags: ['PasswordReset'],
    request: { body: { content: { 'application/json': { schema: PasswordResetSchema.shape.body } }, description: '' } },
    responses: createApiResponse(z.object({}), 'Success'),
  });

  router.post('/', validateRequest(UserLoginSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.trace('[AuthRouter] - [/] - Start');
      logger.trace(`[AuthRouter] - [/] - Request to log in user ${req.body.email}`);
      const session: SessionToken = await authService.login(req.body);
      logger.trace('[AuthRouter] - [/] - User logged in');
      logger.trace('[AuthRouter] - [/] - Setting access token cookie');
      res.cookie('access_token', session.access_token, {
        httpOnly: true,
        maxAge: 12 * 60 * 60 * 1000,
        sameSite: 'lax',
        secure: config.app.node_env === 'production',
        ...(process.env.NODE_ENV === 'production' && {
          domain: process.env.DOMAIN_NAME,
        }),
      });
      logger.trace('[AuthRouter] - [/] - Sending response');
      const response = new ApiResponse(ResponseStatus.Success, 'User logged in', session, StatusCodes.OK);
      handleApiResponse(response, res);
    } catch (ex: unknown) {
      logger.trace(`[AuthRouter] - [/] - Error: ${ex}`);
      if (ex instanceof InvalidCredentialsError) {
        return next(INVALID_CREDENTIALS);
      }
      if (ex instanceof PasswordChangeRequiredError) {
        return next(UNAUTHORIZED);
      }
      logger.trace('[AuthRouter] - [/] - Unexpected error');
      return next(UNEXPECTED_ERROR);
    } finally {
      logger.trace('[AuthRouter] - [/] - End');
    }
  });

  router.delete('/', sessionMiddleware, async (req: Request, res: Response) => {
    logger.trace('[AuthRouter] - [/] - Start');
    logger.trace('[AuthRouter] - [/] - Clearing access token from cookie');
    res.clearCookie('access_token');
    logger.trace('[AuthRouter] - [/] - Sending response');
    const response = new ApiResponse(ResponseStatus.Success, 'User logged out', null, StatusCodes.OK);
    return handleApiResponse(response, res);
  });

  router.post(
    '/setPassword',
    validateRequest(PasswordSetSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      logger.trace('[AuthRouter] - [/setPassword] - Start');
      try {
        logger.trace('[AuthRouter] - [/setPassword] - Setting password...');
        await authService.passwordSet(req.query['token']?.toString() ?? undefined, req.body);
        logger.trace('[AuthRouter] - [/setPassword] - Password set successfully');
        const response = new ApiResponse(ResponseStatus.Success, 'Password set successfully', null, StatusCodes.OK);
        return handleApiResponse(response, res);
      } catch (ex: unknown) {
        logger.trace(`[AuthRouter] - [/setPassword] - Error: ${ex}`);
        if (ex instanceof InvalidCredentialsError) {
          return next(INVALID_CREDENTIALS);
        }
        if (ex instanceof JsonWebTokenError) {
          return next(JWT_MISSING);
        }
        if (ex instanceof PasswordsDoNotMatchError) {
          return next(PASSWORDS_DO_NOT_MATCH);
        }
        if (ex instanceof PasswordNotSecureError) {
          return next(PASSWORD_NOT_SECURE);
        }
        return next(UNEXPECTED_ERROR);
      } finally {
        logger.trace('[AuthRouter] - [/setPassword] - End');
      }
    }
  );

  router.post('/passwordRecovery', async (req: Request, res: Response, next: NextFunction) => {
    logger.trace('[AuthRouter] - [/passwordRecovery] - Start');
    try {
      logger.trace('[AuthRouter] - [/passwordReset] - Received password recovery');
      await authService.passwordRecovery(req.body);
      logger.trace('[AuthRouter] - [/passwordRecovery] - Password recovery done');
      const response = new ApiResponse(ResponseStatus.Success, 'Password recovery done', null, StatusCodes.OK);
      return handleApiResponse(response, res);
    } catch (ex: unknown) {
      logger.trace(`[AuthRouter] - [/passwordRecovery] - Error: ${ex}`);
      return next(UNEXPECTED_ERROR);
    } finally {
      logger.trace('[AuthRouter] - [/passwordRecovery] - End');
    }
  });

  router.get('/', sessionMiddleware, async (req: Request, res: Response) => {
    logger.trace('[AuthRouter] - [/] - Start');
    logger.trace('[AuthRouter] - [/] - Sending response');
    const response = new ApiResponse(ResponseStatus.Success, 'User logged in', null, StatusCodes.OK);
    return handleApiResponse(response, res);
  });

  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  router.get(
    '/google/callback',
    passport.authenticate('google', {
      session: false,
      scope: ['email', 'profile'],
      failureRedirect: `${config.app.frontendUrl}/login`,
    }),
    async (req: Request, res: Response) => {
      try {
        logger.trace('[AuthRouter] - [/google/callback] - Start');
        const profile = req.user as any;
        const access_token = profile.access_token;

        if (!access_token) {
          return res.redirect(`${config.app.frontendUrl}/login`);
        }

        logger.trace('[AuthRouter] - [/google/callback] - Setting Google generated access token cookie');
        res.cookie('access_token', access_token, {
          httpOnly: false,
          maxAge: 12 * 60 * 60 * 1000,
          sameSite: 'lax',
          secure: config.app.node_env === 'production',
        });

        logger.trace('[AuthRouter] - [/google/callback] - Sending response');
        return res.redirect(`${config.app.frontendUrl}/me/profile`);
      } catch (error) {
        logger.error(
          `[AuthRouter] - [/google/callback] - An unexpected error occurred while logging in with Google: ${error}`
        );
        res.clearCookie('access_token');
        return res.redirect(`${config.app.frontendUrl}/login`);
      }
    }
  );

  return router;
})();
