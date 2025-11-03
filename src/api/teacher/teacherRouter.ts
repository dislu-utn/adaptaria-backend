import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { NextFunction, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { CourseDTO, CourseDTOSchema } from '@/api/course/courseModel';
import { courseService } from '@/api/course/courseService';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { roleMiddleware } from '@/common/middleware/roleMiddleware';
import { sessionMiddleware, SessionRequest } from '@/common/middleware/session';
import { ApiError } from '@/common/models/apiError';
import { ApiResponse, ResponseStatus } from '@/common/models/apiResponse';
import { Role } from '@/common/models/role';
import { handleApiResponse, validateRequest } from '@/common/utils/httpHandlers';
import { logger } from '@/common/utils/serverLogger';

import { connector_sync } from '../connector/connector_sync';
import { directorService } from '../director/directorService';
import { UserCreationMassiveSchema, UserCreationSchema, UserDTOSchema } from '../user/userModel';
import { teacherService } from './teacherService';

const UNAUTHORIZED = new ApiError('Unauthorized', StatusCodes.UNAUTHORIZED);

export const teacherRegistry = new OpenAPIRegistry();

teacherRegistry.register('Teacher', UserDTOSchema);
teacherRegistry.register('Course', CourseDTOSchema);

export const teacherRouter: Router = (() => {
  const router = express.Router();

  teacherRegistry.registerPath({
    method: 'post',
    path: '/teachers/',
    tags: ['Teacher'],
    request: { body: { content: { 'application/json': { schema: UserCreationSchema.shape.body } }, description: '' } },
    responses: createApiResponse(UserDTOSchema, 'Success'),
  });

  router.post(
    '/',
    sessionMiddleware,
    roleMiddleware([Role.DIRECTOR]),
    validateRequest(UserCreationSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        return next(UNAUTHORIZED);
      }

      try {
        logger.trace('[TeacherRouter] - [/] - Start');
        const teacher = req.body;
        logger.trace(`[TeacherRouter] - [/] - Creating teacher: ${JSON.stringify(teacher)}`);
        const directorUserId = sessionContext.user.id;
        const createdTeacher = await teacherService.create(teacher, directorUserId);
        logger.trace(`[TeacherRouter] - [/] - Teacher created: ${JSON.stringify(createdTeacher)}`);
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Teacher successfully created',
          createdTeacher,
          StatusCodes.CREATED
        );

        connector_sync('teacher', createdTeacher.id, 'create');

        handleApiResponse(apiResponse, res);
      } catch (e) {
        logger.error(`[TeacherRouter] - [/] - Error: ${e}`);
        return next(e);
      } finally {
        logger.trace('[TeacherRouter] - [/] - End');
      }
    }
  );

  teacherRegistry.registerPath({
    method: 'post',
    path: '/teachers/massive',
    tags: ['Teacher'],
    request: {
      body: { content: { 'application/json': { schema: UserCreationMassiveSchema.shape.body } }, description: '' },
    },
    responses: createApiResponse(UserDTOSchema, 'Success'),
  });
  router.post(
    '/massive',
    sessionMiddleware,
    roleMiddleware([Role.DIRECTOR]),
    validateRequest(UserCreationMassiveSchema), // Aseguramos que sea un array de estudiantes
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        return next(UNAUTHORIZED);
      }

      try {
        logger.trace('[TeacherRouter] - [/] - Start');
        logger.trace(`[TeacherRouter] - [/] - Request to create teachers: ${JSON.stringify(req.body)}`);

        const directorUserId = sessionContext.user.id;
        const teachersDTO = await teacherService.createMultiple(req.body, directorUserId);

        logger.trace(`[TeacherRouter] - [/] - teachers created: ${JSON.stringify(teachersDTO)}. Sending response`);
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'teachers created successfully',
          teachersDTO,
          StatusCodes.CREATED
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[TeacherRouter] - [/] - Error: ${error}`);
        const apiError = new ApiError('Failed to create teachers', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return res.status(apiError.statusCode).json(apiError);
      } finally {
        logger.trace('[TeacherRouter] - [/] - End');
      }
    }
  );

  teacherRegistry.registerPath({
    method: 'get',
    path: '/teachers/me/courses/',
    tags: ['Teacher'],
    responses: createApiResponse(z.array(CourseDTOSchema), 'Success'),
  });
  router.get(
    '/me/courses',
    sessionMiddleware,
    roleMiddleware([Role.TEACHER]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        logger.trace('[TeacherRouter] - [/me/courses] - Session context is missing, sending error response');
        return next(UNAUTHORIZED);
      }

      try {
        logger.trace('[TeacherRouter] - [/me/courses] - Start');
        const teacherUserId = sessionContext.user.id;

        logger.trace(`[TeacherRouter] - [/me/courses] - Retrieving courses for teacher with id: ${teacherUserId}...`);
        const courses: CourseDTO[] = await courseService.findCoursesByTeacherId(teacherUserId);
        logger.trace(`[TeacherRouter] - [/me/courses] - Courses found: ${JSON.stringify(courses)}. Sending response`);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Courses retrieved successfully',
          courses,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        logger.error(`[TeacherRouter] - [/me/courses] - Error: ${e}`);
        const apiError = new ApiError('Failed to retrieve courses', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  router.get(
    '/',
    sessionMiddleware,
    roleMiddleware([Role.DIRECTOR]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        return next(UNAUTHORIZED);
      }

      try {
        const directorUserId = sessionContext.user.id;
        const instituteId = await directorService.getInstituteId(directorUserId);
        const teachers = await teacherService.findByInstituteId(instituteId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Teachers retrieved successfully',
          teachers,
          StatusCodes.OK
        );
        res.status(StatusCodes.OK).json(apiResponse);
      } catch (error) {
        const apiError = new ApiError('Failed to retrieve teachers', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  return router;
})();
