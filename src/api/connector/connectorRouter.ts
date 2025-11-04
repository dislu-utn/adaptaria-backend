import express, { NextFunction, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';

import {
  AddStudentsSchema,
  CourseCreationSchema,
  CourseDTO,
  CourseUpdateDTO,
  CourseUpdateSchema,
} from '@/api/course/courseModel';
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
import { ContentCreationSchema } from '../course/content/contentModel';
import { courseService } from '../course/courseService';
import { SectionCreationSchema, SectionDTO, SectionUpdateSchema } from '../course/section/sectionModel';
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

  router.patch(
    '/:courseId',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.DIRECTOR]),
    validateRequest(CourseUpdateSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const courseId = req.params.courseId;

        // Obtener datos para actualizar
        const courseUpdateData: CourseUpdateDTO = {
          ...req.body,
        };

        const updatedCourse: CourseDTO = await courseService.update(courseId, courseUpdateData);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Course updated successfully',
          updatedCourse,
          StatusCodes.OK
        );

        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[CourseRouter] - [/update] - Error: ${error}`);
        const apiError = new ApiError('Failed to update course', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/update] - End');
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

  router.post(
    '/:courseId/section',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.DIRECTOR]),
    validateRequest(SectionCreationSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { courseId } = req.params;
      const sectionData = req.body;

      try {
        const updatedSection: SectionDTO = await courseService.addSectionToCourse(courseId, sectionData);
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Section added to course successfully',
          updatedSection,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        logger.error(`[CourseRouter] - [/:courseId/section] - Error: ${e}`);
        const apiError = new ApiError('Failed to add section to course', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/:courseId/section] - End');
      }
    }
  );

  router.patch(
    '/:courseId/sections/:sectionId',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.DIRECTOR]),
    validateRequest(SectionUpdateSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { courseId, sectionId } = req.params;
      const updateData = req.body;

      try {
        // Llamar al servicio para actualizar la sección
        const updatedSection = await courseService.updateSection(courseId, sectionId, updateData);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Section updated successfully',
          updatedSection,
          StatusCodes.OK
        );

        handleApiResponse(apiResponse, res);
      } catch (e) {
        logger.error(`[CourseRouter] - [/:courseId/sections/:sectionId] - Error: ${e}`);
        const apiError = new ApiError('Failed to update section', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/:courseId/sections/:sectionId] - End');
      }
    }
  );

  const storage = multer.memoryStorage();
  const upload = multer({ storage });
  router.post(
    '/contents/:sectionId',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.DIRECTOR]),
    upload.single('file'),
    validateRequest(ContentCreationSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { sectionId } = req.params;
      const contentData = req.body;
      const file = req.file;
      if (!file) {
        return next(new ApiError('File is required', StatusCodes.BAD_REQUEST));
      }

      try {
        const newContent = await courseService.addContentToSection(sectionId, contentData, file);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Content added to section successfully',
          newContent,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to add content to section', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/:courseId/sections/:sectionId/content] - End');
      }
    }
  );

  router.get(
    '/contents/:id',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.DIRECTOR]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      if (!req.sessionContext || !req.sessionContext.user) {
        return next(new ApiError('Unauthorized', StatusCodes.UNAUTHORIZED, 'User is not authenticated'));
      }

      const { id } = req.params;

      try {
        const content = await courseService.getContentById(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Contents retrieved successfully',
          content,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to retrieve content', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  return router;
})();
