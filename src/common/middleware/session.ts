import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import jwt from 'jsonwebtoken';

import { SessionContext, SessionContextSchema, SessionPayload, SessionPayloadSchema } from '@/api/auth/authModel';
import { userRepository } from '@/api/user/userRepository';
import { ApiError } from '@/common/models/apiError';
import { logger } from '@/common/utils/serverLogger';

import { config } from '../utils/config';

export interface SessionRequest extends Request {
  sessionContext?: SessionContext;
  body: Request['body'];
  params: Request['params'];
  cookies: Request['cookies'];
  headers: Request['headers'];
  file?: Request['file'];
}

export const sessionMiddleware = async (req: SessionRequest, res: Response, next: NextFunction) => {
  try {
    // Header: Authorization: Bearer <token>
    // Cookie: access_token=<token>
    logger.trace('[Session Middleware] - Start');
    logger.trace(`[Session Middleware] - Checking if access token is present...`);
    const accessToken = req.cookies.access_token ?? req.headers.authorization?.split(' ')[1];
    if (!accessToken) {
      logger.trace(`[Session Middleware] - Access token is missing, sending error response`);
      return next(new ApiError('Failed to retrieve session', StatusCodes.UNAUTHORIZED, 'Access token is missing'));
    }

    logger.trace(`[Session Middleware] - Access Token found. Verifying accessToken...`);
    if (!jwt.verify(accessToken, config.jwt.secret as string)) {
      logger.trace(`[Session Middleware] - Token is not valid, sending error response'`);
      return next(new ApiError('Failed to retrieve session', StatusCodes.UNAUTHORIZED, 'Token not valid'));
    }

    // TODO: Make it simpler
    logger.trace(`[Session Middleware] - Decoding accessToken...`);
    const sessionPayload: SessionPayload = SessionPayloadSchema.parse(jwt.decode(accessToken, { json: true }));
    logger.trace(`[Session Middleware] - SessionPayload: ${JSON.stringify(sessionPayload)}`);
    logger.trace(`[Session Middleware] - Finding user by id...`);
    const user = await userRepository.findByIdAsync(sessionPayload.id.toString());
    logger.trace(
      `[Session Middleware] - User: ${JSON.stringify([user.toDto().id, user.email, user.role, user.nextDateSurvey])}`
    );
    const sessionContext: SessionContext = SessionContextSchema.parse({ user });

    if (!sessionContext) {
      logger.trace(`[Session Middleware] - Session not found, sending error response`);
      return next(new ApiError('Failed to retrieve session', StatusCodes.UNAUTHORIZED, 'Session not found'));
    }

    req.sessionContext = sessionContext;

    logger.info(`Session found from ${req.sessionContext.user?.email}`);
    return next();
  } catch (e) {
    logger.trace(`[Session Middleware] - Error: ${e}`);
    return next(new ApiError('Interal error found', StatusCodes.INTERNAL_SERVER_ERROR, 'Internal error'));
  } finally {
    logger.trace('[Session Middleware] - End');
  }
};
