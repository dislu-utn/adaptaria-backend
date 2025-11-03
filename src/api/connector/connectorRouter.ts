import express, { NextFunction, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import { AddStudentsSchema, CourseCreationSchema, CourseDTO } from '@/api/course/courseModel';
import {
  GetUserSchema,
  UpdateUserProfileSchema,
  UserCreationSchema,
  UserDirectorCreationSchema,
  UserDTO,
} from '@/api/user/userModel';
import { checkSessionContext } from '@/common/middleware/checkSessionContext';
import { roleMiddleware } from '@/common/middleware/roleMiddleware';
import { sessionMiddleware, SessionRequest } from '@/common/middleware/session';
import { ApiError } from '@/common/models/apiError';
import { ApiResponse, ResponseStatus } from '@/common/models/apiResponse';
import { Role } from '@/common/models/role';
import { handleApiResponse, validateRequest } from '@/common/utils/httpHandlers';
import { logger } from '@/common/utils/serverLogger';

import { InvalidCredentialsError } from '../auth/authModel';
import { courseService } from '../course/courseService';
import { directorService } from '../director/directorService';
import { studentService } from '../student/studentService';
import { userService } from '../user/userService';
const UNAUTHORIZED = new ApiError('Unauthorized', StatusCodes.UNAUTHORIZED);

export const connectorRouter: Router = (() => {
  const router = express.Router();

  router.get(
    '/users/:id',
    validateRequest(GetUserSchema),
    roleMiddleware([Role.DIRECTOR]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const userReq = GetUserSchema.parse({ params: req.params });
        const user: UserDTO & { password?: string } = await userService.findById(userReq.params.id.toString());
        user.password = await userService.getHashedPassword(user.id!);
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'User retrieved successfully',
          user,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        if (e instanceof InvalidCredentialsError) {
          const apiError = new ApiError('User not found', StatusCodes.NOT_FOUND, e);
          return next(apiError);
        }
        return next(new ApiError('Failed to retrieve user', StatusCodes.INTERNAL_SERVER_ERROR, e));
      } finally {
        logger.trace('[UserRouter] - [/:id] - End');
      }
    }
  );

  router.get(
    '/users/get_hashed_password/:id',
    roleMiddleware([Role.DIRECTOR]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const userReq = GetUserSchema.parse({ params: req.params });
        const password = await userService.getHashedPassword(userReq.params.id.toString());
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'User retrieved successfully',
          password,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        if (e instanceof InvalidCredentialsError) {
          const apiError = new ApiError('User not found', StatusCodes.NOT_FOUND, e);
          return next(apiError);
        }
        return next(new ApiError('Failed to retrieve user', StatusCodes.INTERNAL_SERVER_ERROR, e));
      } finally {
        logger.trace('[UserRouter] - [/:id] - End');
      }
    }
  );

  router.patch(
    '/users/me',
    sessionMiddleware,
    roleMiddleware([Role.DIRECTOR]),
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
        handleApiResponse(apiResponse, res);
      } catch (error) {
        const apiError = new ApiError('Failed to update user profile', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  router.post(
    '/students',
    sessionMiddleware,
    roleMiddleware([Role.DIRECTOR]),
    validateRequest(UserCreationSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        return next(UNAUTHORIZED);
      }

      try {
        const directorUserId = sessionContext.user.id;
        const userDTO: UserDTO = await studentService.create(req.body, directorUserId);
        logger.trace(`[StudentRouter] - [/] - Student created: ${JSON.stringify(userDTO)}. Sending response`);
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Student created successfully',
          userDTO,
          StatusCodes.CREATED
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[StudentRouter] - [/] - Error: ${error}`);
        const apiError = new ApiError('Failed to create student', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return res.status(apiError.statusCode).json(apiError);
      } finally {
        logger.trace('[StudentRouter] - [/] - End');
      }
    }
  );

  router.post(
    '/directors',
    validateRequest(UserDirectorCreationSchema),
    roleMiddleware([Role.DIRECTOR]),
    async (req: SessionRequest, res: Response) => {
      try {
        const userDTO: UserDTO = await directorService.create(req.body);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Director created successfully',
          userDTO,
          StatusCodes.CREATED
        );

        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[DirectorRouter] - [/:instituteId] - Error: ${error}`);
        const apiError = new ApiError('Failed to create director', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return res.status(apiError.statusCode).json(apiError);
      } finally {
        logger.trace('[DirectorRouter] - [/:instituteId] - End');
      }
    }
  );

  router.post(
    '/courses',
    sessionMiddleware,
    roleMiddleware([Role.DIRECTOR]),
    validateRequest(CourseCreationSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        logger.trace('[CourseRouter] - [/create] - Start');
        logger.trace('[CourseRouter] - [/create] - Creating course...');

        const { teacherUserId, ...courseData } = req.body;
        if (!teacherUserId) {
          return next(UNAUTHORIZED);
        }

        const createdCourse: CourseDTO = await courseService.create(courseData, teacherUserId);
        logger.trace(`[CourseRouter] - [/create] - Course created: ${JSON.stringify(createdCourse)}. Sending response`);
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Course created successfully',
          createdCourse,
          StatusCodes.CREATED
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[CourseRouter] - [/create] - Error: ${error}`);
        const apiError = new ApiError('Failed to create course', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/create] - End');
      }
    }
  );

  router.post(
    '/courses/:courseId/students',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.DIRECTOR]),
    validateRequest(AddStudentsSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { courseId } = req.params;
      const { studentEmails } = req.body;

      try {
        logger.trace('[CourseRouter] - [/:courseId/students] - Start');
        const updatedCourse = await courseService.addStudentsToCourse(courseId, studentEmails);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Students added to course successfully',
          updatedCourse,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        logger.error(`[CourseRouter] - [/:courseId/students] - Error: ${e}`);
        const apiError = new ApiError('Failed to add students to course', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/:courseId/students] - End');
      }
    }
  );

  return router;
})();
