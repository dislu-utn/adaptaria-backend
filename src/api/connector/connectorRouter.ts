import express, { NextFunction, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import { z } from 'zod';

import {
  AddStudentsSchema,
  CourseCreationSchema,
  CourseDTO,
  CourseUpdateDTO,
  CourseUpdateSchema,
  GetCourseSchema,
} from '@/api/course/courseModel';
import {
  GetUserSchema,
  UpdateUserProfileSchema,
  UpdateUserRoleSchema,
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
import {
  SectionCreationSchema,
  SectionDTO,
  SectionFetchingSchema,
  SectionUpdateSchema,
} from '../course/section/sectionModel';
import { sectionService } from '../course/section/sectionService';
import { directorService } from '../director/directorService';
import { InstituteCreationSchema, InstituteDTO } from '../institute/instituteModel';
import { instituteService } from '../institute/instituteService';
import { studentService } from '../student/studentService';
import { teacherService } from '../teacher/teacherService';
import { userService } from '../user/userService';
import { connector_sync } from './connector_sync';
const UNAUTHORIZED = new ApiError('Unauthorized', StatusCodes.UNAUTHORIZED);

// Schema para validar el sync request
const SyncSchema = z.object({
  body: z.object({
    id: z.string().min(1, 'Institution ID is required'),
  }),
});

export const connectorRouter: Router = (() => {
  const router = express.Router();

  /**
   * Sincronizar institución
   * POST /connector/sync
   */

  router.post(
    '/sync',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.ADMIN, Role.DIRECTOR]),
    validateRequest(SyncSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { id: institution_id } = req.body;

        logger.trace(`[ConnectorRouter] - [/sync] - POST - Syncing institution ${institution_id}`);

        // Llamar a la función de sincronización
        const resp = await connector_sync(institution_id, 'institute', institution_id, 'sync');

        if (!resp) {
          throw Error('Internal Server Error');
        }

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Sync initiated successfully',
          { institution_id },
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[ConnectorRouter] - [/sync] - POST - Error: ${error}`);
        const apiError = new ApiError('Failed to sync institution', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      } finally {
        logger.trace('[ConnectorRouter] - [/sync] - POST - End');
      }
    }
  );

  router.get(
    '/sync/:id',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.ADMIN, Role.DIRECTOR]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { id: institution_id } = req.params;
        if (!institution_id) {
          throw Error(`Invalid institution_id: ${institution_id}`);
        }

        logger.trace(`[ConnectorRouter] - [/sync] - GET - ${institution_id}`);

        const resp = await fetch(process.env.DISLU_URL + 'api/institution/get_external_id/' + institution_id);

        if (!resp.ok) {
          throw Error('Not found');
        }

        const data = await resp.json();
        const isSynchronized = data === true || data?.synchronized === true;

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Sync status retrieved successfully',
          isSynchronized,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[ConnectorRouter] - [/sync] - GET - Error: ${error}`);
        const apiError = new ApiError('Failed to get sync status', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      } finally {
        logger.trace('[ConnectorRouter] - [/sync] - GET - End');
      }
    }
  );

  router.get(
    '/users/get_hashed_password/:id',
    roleMiddleware([Role.ADMIN]),
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
    roleMiddleware([Role.ADMIN]),
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

  router.patch(
    '/users/:userId/role',
    sessionMiddleware,
    roleMiddleware([Role.ADMIN]),
    validateRequest(UpdateUserRoleSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { userId } = req.params;
        const { newRole } = req.body;

        logger.trace(`[ConnectorRouter] - [/users/:userId/role] - Updating user ${userId} role to ${newRole}`);

        const updatedUserDTO = await userService.updateUserRole(userId, newRole);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'User role updated successfully',
          updatedUserDTO,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[ConnectorRouter] - [/users/:userId/role] - Error: ${error}`);
        const apiError = new ApiError('Failed to update user role', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  router.get(
    '/users/:id',
    validateRequest(GetUserSchema),
    roleMiddleware([Role.ADMIN]),
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

  router.post(
    '/students',
    sessionMiddleware,
    roleMiddleware([Role.ADMIN]),
    validateRequest(UserCreationSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        return next(UNAUTHORIZED);
      }

      try {
        const { institute, ...rest } = req.body;

        const director = (await directorService.findByInstituteId(institute.id)).pop();
        const userDTO: UserDTO = await studentService.create(rest, director!.user.id);
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
    roleMiddleware([Role.ADMIN]),
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
    roleMiddleware([Role.ADMIN]),
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
    roleMiddleware([Role.ADMIN]),
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
    '/courses/:courseId/sections',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.ADMIN]),
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
    '/courses/:courseId/sections/:sectionId',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.ADMIN]),
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
    '/courses/contents/:sectionId',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.ADMIN]),
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

        //// Iniciar procesamiento automático en background (sin await para no bloquear)
        //// Nota: desde el connector, usamos un instituteId genérico o lo obtenemos de la sección
        //const connectorUrl = process.env.CONNECTOR_URL || 'http://localhost:5000/';
        //const instituteId = req.body.instituteId || 'admin'; // El connector debe proporcionar el instituteId
        //contentService.autoProcessContent(newContent.id, connectorUrl, instituteId).catch((error) => {
        //  logger.error(`[ConnectorRouter] - Auto-process failed for content ${newContent.id}: ${error}`);
        //});

        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to add content to section', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/:courseId/sections/:sectionId/content] - End');
      }
    }
  );

  router.patch(
    '/courses/:courseId',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.ADMIN]),
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

  router.get(
    '/courses/:id',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.ADMIN]),
    validateRequest(GetCourseSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        logger.trace('[CourseRouter] - [/:id] - Start');
        const courseReq = GetCourseSchema.parse({ params: req.params });
        logger.trace(`[CourseRouter] - [/:id] - Retrieving course with id: ${courseReq.params.id}...`);

        const course: CourseDTO = await courseService.findById(courseReq.params.id.toString());
        logger.trace(`[CourseRouter] - [/:id] - Course found: ${JSON.stringify(course)}. Sending response`);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Course retrieved successfully',
          course,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        logger.error(`[CourseRouter] - [/:id] - Error: ${e}`);
        const apiError = new ApiError('Failed to retrieve course', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/:id] - End');
      }
    }
  );

  router.get(
    '/contents/:id',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.ADMIN]),
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

  // ==========================================
  // Institute Endpoints
  // ==========================================

  router.post(
    '/institutes',
    validateRequest(InstituteCreationSchema),
    roleMiddleware([Role.ADMIN]),
    async (req: SessionRequest, res: Response) => {
      try {
        logger.trace('[InstituteRouter] - [POST /institutes] - Start');
        logger.trace(
          `[InstituteRouter] - [POST /institutes] - Request to create institute: ${JSON.stringify(req.body)}`
        );

        const instituteDTO: InstituteDTO = await instituteService.create(req.body);

        logger.trace(
          `[InstituteRouter] - [POST /institutes] - Institute created: ${JSON.stringify(instituteDTO)}. Sending response`
        );
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Institute created successfully',
          instituteDTO,
          StatusCodes.CREATED
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[InstituteRouter] - [POST /institutes] - Error: ${error}`);
        const apiError = new ApiError('Failed to create institute', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return res.status(apiError.statusCode).json(apiError);
      } finally {
        logger.trace('[InstituteRouter] - [POST /institutes] - End');
      }
    }
  );

  /**
   * Obtener instituto por ID
   * GET /connector/institutes/:id
   */
  router.get(
    '/institutes/:id',
    roleMiddleware([Role.ADMIN]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        logger.trace(`[ConnectorRouter] - [/institutes/:id] - Getting institute ${id}`);

        const institute = await instituteService.findById(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Institute retrieved successfully',
          institute,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to retrieve institute', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  /**
   * Obtener cursos de un instituto
   * GET /connector/institutes/:id/courses
   */
  router.get(
    '/institutes/:id/courses',
    roleMiddleware([Role.ADMIN]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        logger.trace(`[ConnectorRouter] - [/institutes/:id/courses] - Getting courses for institute ${id}`);

        const courses = await courseService.findCoursesByInstituteId(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Courses retrieved successfully',
          courses,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to retrieve courses', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  /**
   * Obtener directores de un instituto
   * GET /connector/institutes/:id/directors
   */
  router.get(
    '/institutes/:id/directors',
    roleMiddleware([Role.ADMIN]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        logger.trace(`[ConnectorRouter] - [/institutes/:id/directors] - Getting directors for institute ${id}`);

        const directors = await directorService.findByInstituteId(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Directors retrieved successfully',
          directors,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to retrieve directors', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  /**
   * Obtener estudiantes de un instituto
   * GET /connector/institutes/:id/students
   */
  router.get(
    '/institutes/:id/students',
    roleMiddleware([Role.ADMIN]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        logger.trace(`[ConnectorRouter] - [/institutes/:id/students] - Getting students for institute ${id}`);

        const students = await studentService.getStudentsByInstituteId(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Students retrieved successfully',
          students,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to retrieve students', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  /**
   * Obtener profesores de un instituto
   * GET /connector/institutes/:id/teachers
   */
  router.get(
    '/institutes/:id/teachers',
    roleMiddleware([Role.ADMIN]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        logger.trace(`[ConnectorRouter] - [/institutes/:id/teachers] - Getting teachers for institute ${id}`);

        const teachers = await teacherService.findByInstituteId(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Teachers retrieved successfully',
          teachers,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to retrieve teachers', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  /**
   * Obtener secciones de un curso
   * GET /connector/courses/:id/sections
   */
  router.get(
    '/courses/:id/sections',
    roleMiddleware([Role.ADMIN]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        logger.trace(`[ConnectorRouter] - [/courses/:id/sections] - Getting sections for course ${id}`);

        const sections = await courseService.getSectionsOfCourse(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Sections retrieved successfully',
          sections,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to retrieve sections', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  router.get(
    '/courses/:courseId/sections/:sectionId',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.ADMIN]),
    validateRequest(SectionFetchingSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { sectionId } = req.params;
      logger.trace(`[ConnectorRouter] - [/:courseId/sections/:sectionId] - Getting sections for course ${sectionId}`);

      try {
        const section = await sectionService.findById(sectionId);
        res.status(200).json({
          success: true,
          message: 'Section retrieved successfully',
          data: section,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * Obtener estudiantes de un curso
   * GET /connector/courses/:id/students
   */
  router.get(
    '/courses/:id/students',
    roleMiddleware([Role.ADMIN]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        logger.trace(`[ConnectorRouter] - [/courses/:id/students] - Getting students for course ${id}`);

        const students = await courseService.getStudentsOfCourse(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Students retrieved successfully',
          students,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to retrieve students', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  /**
   * Obtener contents de una sección
   * GET /connector/sections/:id/contents
   */
  router.get(
    '/sections/:id/contents',
    roleMiddleware([Role.ADMIN]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        logger.trace(`[ConnectorRouter] - [/sections/:id/contents] - Getting contents for section ${id}`);

        const contents = await courseService.getContentsWithPresignedUrls(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Contents retrieved successfully',
          contents,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to retrieve contents', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  return router;
})();
