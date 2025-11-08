import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { NextFunction, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import { z } from 'zod';

import { ContentCreationSchema, ContentWithPresignedUrlSchema } from '@/api/course/content/contentModel';
import { contentService } from '@/api/course/content/contentService';
import {
  AddStudentsSchema,
  CourseCreationSchema,
  CourseDTO,
  CourseDTOSchema,
  CourseUpdateDTO,
  CourseUpdateSchema,
  DeleteCourseSchema,
  DeleteUserFromCourseSchema,
  GetCourseSchema,
  VerifyMatriculationCodeSchema,
} from '@/api/course/courseModel';
import { courseService } from '@/api/course/courseService';
import {
  DeleteSectionSchema,
  SectionCreationSchema,
  SectionDTO,
  SectionDTOSchema,
  SectionFetchingSchema,
  SectionUpdateSchema,
} from '@/api/course/section/sectionModel';
import { sectionService } from '@/api/course/section/sectionService';
import { StudentDTOSchema } from '@/api/student/studentModel';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { checkSessionContext } from '@/common/middleware/checkSessionContext';
import { hasAccessToCourseMiddleware } from '@/common/middleware/hasAccessToCourse';
import { roleMiddleware } from '@/common/middleware/roleMiddleware';
import { sessionMiddleware, SessionRequest } from '@/common/middleware/session';
import { ApiError } from '@/common/models/apiError';
import { ApiResponse, ResponseStatus } from '@/common/models/apiResponse';
import { Role } from '@/common/models/role';
import { handleApiResponse, validateRequest } from '@/common/utils/httpHandlers';
import { logger } from '@/common/utils/serverLogger';

import { connector_sync } from '../connector/connector_sync';
import { teacherService } from '../teacher/teacherService';

const storage = multer.memoryStorage();
const upload = multer({ storage });

const UNAUTHORIZED = new ApiError('Unauthorized', StatusCodes.UNAUTHORIZED);

export const courseRegistry = new OpenAPIRegistry();
courseRegistry.register('Course', CourseDTOSchema);

export const courseRouter: Router = (() => {
  const router = express.Router();

  courseRegistry.registerPath({
    method: 'post',
    path: '/courses',
    tags: ['Course'],
    request: {
      body: { content: { 'application/json': { schema: CourseCreationSchema.shape.body } }, description: '' },
    },
    responses: createApiResponse(CourseDTOSchema, 'Success'),
  });
  router.post(
    '/',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.TEACHER]),
    validateRequest(CourseCreationSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        logger.trace('[TeacherRouter] - [/me/courses] - Session context is missing, sending error response');
        return next(UNAUTHORIZED);
      }

      try {
        logger.trace('[CourseRouter] - [/create] - Start');
        logger.trace('[CourseRouter] - [/create] - Creating course...');

        const teacherUserId = sessionContext.user.id;

        const courseData = {
          ...req.body,
        };

        const createdCourse: CourseDTO = await courseService.create(courseData, teacherUserId);
        logger.trace(`[CourseRouter] - [/create] - Course created: ${JSON.stringify(createdCourse)}. Sending response`);

        // Obtener el instituteId del teacher para sincronizar
        const instituteId = await teacherService.getInstituteId(teacherUserId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Course created successfully',
          createdCourse,
          StatusCodes.CREATED
        );
        connector_sync(instituteId, 'course', createdCourse.id, 'create');

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

  courseRegistry.registerPath({
    method: 'get',
    path: '/courses/{id}',
    tags: ['Course'],
    request: { params: GetCourseSchema.shape.params },
    responses: createApiResponse(CourseDTOSchema, 'Success'),
  });
  router.get(
    '/:id',
    sessionMiddleware,
    checkSessionContext,
    hasAccessToCourseMiddleware('id'),
    roleMiddleware([Role.TEACHER, Role.STUDENT]),
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

  courseRegistry.registerPath({
    method: 'post',
    path: '/courses/{courseId}/section',
    tags: ['Course'],
    request: {
      params: SectionCreationSchema.shape.params,
      body: { content: { 'application/json': { schema: SectionCreationSchema.shape.body } }, description: '' },
    },
    responses: createApiResponse(CourseDTOSchema, 'Success'),
  });
  router.post(
    '/:courseId/section',
    sessionMiddleware,
    checkSessionContext,
    hasAccessToCourseMiddleware('courseId'),
    roleMiddleware([Role.TEACHER]),
    validateRequest(SectionCreationSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { courseId } = req.params;
      const sectionData = req.body;

      try {
        logger.trace('[CourseRouter] - [/:courseId/section] - Start');
        const courseReq = GetCourseSchema.parse({ params: req.params });
        logger.trace(`[CourseRouter] - [/:courseId/section] - Retrieving course with id: ${courseReq.params.id}...`);

        const updatedSection: SectionDTO = await courseService.addSectionToCourse(courseId, sectionData);

        // Obtener el instituteId a través del curso
        const course = await courseService.findById(courseId);
        const instituteId = await teacherService.getInstituteId(course.teacherUserId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Section added to course successfully',
          updatedSection,
          StatusCodes.OK
        );
        connector_sync(instituteId, 'subject', courseId + '/' + updatedSection.id, 'create');
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

  courseRegistry.registerPath({
    method: 'patch',
    path: '/courses/{courseId}/sections/{sectionId}',
    tags: ['Course'],
    request: {
      params: SectionUpdateSchema.shape.params,
      body: { content: { 'application/json': { schema: SectionUpdateSchema.shape.body } }, description: '' },
    },
    responses: createApiResponse(SectionDTOSchema, 'Success'),
  });

  router.patch(
    '/:courseId/sections/:sectionId',
    sessionMiddleware,
    checkSessionContext,
    hasAccessToCourseMiddleware('courseId'),
    roleMiddleware([Role.TEACHER]),
    validateRequest(SectionUpdateSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { courseId, sectionId } = req.params;
      const updateData = req.body;

      try {
        logger.trace('[CourseRouter] - [/:courseId/sections/:sectionId] - Start');
        logger.trace(`[CourseRouter] - [/:courseId/sections/:sectionId] - Updating section: ${sectionId}`);

        // Llamar al servicio para actualizar la sección
        const updatedSection = await courseService.updateSection(courseId, sectionId, updateData);

        // Obtener el instituteId a través del curso
        const course = await courseService.findById(courseId);
        const instituteId = await teacherService.getInstituteId(course.teacherUserId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Section updated successfully',
          updatedSection,
          StatusCodes.OK
        );

        connector_sync(instituteId, 'subject', courseId + '/' + updatedSection.id, 'update');
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

  courseRegistry.registerPath({
    method: 'get',
    path: '/courses/{courseId}/sections/{sectionId}',
    tags: ['Course'],
    request: {
      params: SectionFetchingSchema.shape.params,
    },
    responses: createApiResponse(SectionDTOSchema, 'Success'),
  });
  router.get(
    '/:courseId/sections/:sectionId',
    sessionMiddleware,
    checkSessionContext,
    hasAccessToCourseMiddleware('courseId'),
    roleMiddleware([Role.TEACHER, Role.STUDENT]),
    validateRequest(SectionFetchingSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { sectionId } = req.params;

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

  courseRegistry.registerPath({
    method: 'get',
    path: '/courses/{id}/sections',
    tags: ['Course'],
    request: { params: GetCourseSchema.shape.params },
    responses: createApiResponse(z.array(SectionDTOSchema), 'Success'),
  });
  router.get(
    '/:id/sections',
    sessionMiddleware,
    checkSessionContext,
    hasAccessToCourseMiddleware('id'),
    roleMiddleware([Role.TEACHER, Role.STUDENT]),
    validateRequest(GetCourseSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { id } = req.params;

      try {
        logger.trace('[CourseRouter] - [/:id/sections] - Start');
        const sections = await courseService.getSectionsOfCourse(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Sections retrieved successfully',
          sections,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        logger.error(`[CourseRouter] - [/:id/sections] - Error: ${e}`);
        const apiError = new ApiError('Failed to retrieve sections', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/:id/sections] - End');
      }
    }
  );

  courseRegistry.registerPath({
    method: 'post',
    path: '/courses/{courseId}/sections/{sectionId}/content',
    tags: ['Course'],
    request: {
      params: ContentCreationSchema.shape.params,
      body: { content: { 'application/json': { schema: ContentCreationSchema.shape.body } }, description: '' },
    },
    responses: createApiResponse(ContentWithPresignedUrlSchema, 'Success'),
  });
  router.post(
    '/:courseId/sections/:sectionId/contents',
    sessionMiddleware,
    checkSessionContext,
    hasAccessToCourseMiddleware('courseId'),
    roleMiddleware([Role.TEACHER]),
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
        logger.trace('[CourseRouter] - [/:courseId/sections/:sectionId/content] - Start');

        const newContent = await courseService.addContentToSection(sectionId, contentData, file);

        // Obtener el instituteId a través del curso
        const { courseId } = req.params;
        const course = await courseService.findById(courseId);
        const instituteId = await teacherService.getInstituteId(course.teacherUserId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Content added to section successfully',
          newContent,
          StatusCodes.OK
        );
        connector_sync(instituteId, 'content', newContent.id, 'create');
        handleApiResponse(apiResponse, res);
      } catch (e) {
        logger.error(`[CourseRouter] - [/:courseId/sections/:sectionId/content] - Error: ${e}`);
        const apiError = new ApiError('Failed to add content to section', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/:courseId/sections/:sectionId/content] - End');
      }
    }
  );

  courseRegistry.registerPath({
    method: 'get',
    path: '/courses/{courseId}/sections/{sectionId}/content',
    tags: ['Course'],
    request: {
      params: ContentCreationSchema.shape.params,
    },
    responses: createApiResponse(z.array(ContentWithPresignedUrlSchema), 'Success'),
  });
  router.get(
    '/:courseId/sections/:sectionId/contents',
    sessionMiddleware,
    checkSessionContext,
    hasAccessToCourseMiddleware('courseId'),
    roleMiddleware([Role.TEACHER, Role.STUDENT]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      if (!req.sessionContext || !req.sessionContext.user) {
        return next(new ApiError('Unauthorized', StatusCodes.UNAUTHORIZED, 'User is not authenticated'));
      }

      const { sectionId } = req.params;
      const role = req.sessionContext.user.role;

      try {
        let contentsWithUrls = await courseService.getContentsWithPresignedUrls(sectionId);

        if (role === Role.STUDENT) {
          // Estudiante: Filtrar los contenidos que estén visibles y aprobados
          contentsWithUrls = contentsWithUrls.filter((content) => {
            const allApproved = content.generated?.every((gen: { approved: boolean }) => gen.approved === true);
            return content.visible === true && allApproved;
          });
        }

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Contents retrieved successfully',
          contentsWithUrls,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        const apiError = new ApiError('Failed to retrieve content', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      }
    }
  );

  courseRegistry.registerPath({
    method: 'post',
    path: '/courses/{courseId}/students',
    tags: ['Course'],
    request: {
      params: AddStudentsSchema.shape.params,
      body: { content: { 'application/json': { schema: AddStudentsSchema.shape.body } }, description: '' },
    },
    responses: createApiResponse(CourseDTOSchema, 'Success'),
  });
  router.post(
    '/:courseId/students',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.TEACHER]),
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

  courseRegistry.registerPath({
    method: 'post',
    path: '/courses/{courseId}/matriculation',
    tags: ['Course'],
    request: {
      params: VerifyMatriculationCodeSchema.shape.params,
      body: { content: { 'application/json': { schema: VerifyMatriculationCodeSchema.shape.body } }, description: '' },
    },
    responses: createApiResponse(CourseDTOSchema, 'Success'),
  });
  router.post(
    '/:courseId/matriculation',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.STUDENT]),
    validateRequest(VerifyMatriculationCodeSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { courseId } = req.params;
      const { studentEmail: studentEmail } = req.body;
      const { matriculationCode: matriculationCode } = req.body;

      try {
        logger.trace('[CourseRouter] - [/:courseId/students] - Start');
        const emailArray = [studentEmail];
        const updatedCourse = await courseService.addStudentWithMatriculationCode(
          courseId,
          matriculationCode,
          emailArray
        );

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Student added to course successfully',
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

  courseRegistry.registerPath({
    method: 'get',
    path: '/courses/{id}/students',
    tags: ['Course'],
    request: { params: GetCourseSchema.shape.params },
    responses: createApiResponse(z.array(StudentDTOSchema), 'Success'),
  });

  router.get(
    '/:id/students',
    sessionMiddleware,
    checkSessionContext,
    hasAccessToCourseMiddleware('id'),
    roleMiddleware([Role.TEACHER]),
    validateRequest(GetCourseSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { id } = req.params;

      try {
        logger.trace('[CourseRouter] - [/:id/students] - Start');
        const students = await courseService.getStudentsOfCourse(id);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Students retrieved successfully',
          students,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (e) {
        logger.error(`[CourseRouter] - [/:id/students] - Error: ${e}`);
        const apiError = new ApiError('Failed to retrieve students', StatusCodes.INTERNAL_SERVER_ERROR, e);
        return next(apiError);
      } finally {
        logger.trace('[CourseRouter] - [/:id/students] - End');
      }
    }
  );

  courseRegistry.registerPath({
    method: 'delete',
    path: '/courses/{courseId}/sections/{sectionId}',
    tags: ['Course'],
    request: {
      params: DeleteSectionSchema.shape.params,
    },
    responses: createApiResponse(z.object({}), 'Success'),
  });
  router.delete(
    '/:courseId/sections/:sectionId',
    sessionMiddleware,
    hasAccessToCourseMiddleware('courseId'),
    roleMiddleware([Role.TEACHER]),
    validateRequest(DeleteSectionSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const courseId = req.params.courseId;
      const sectionId = req.params.sectionId;

      try {
        await sectionService.deleteSection(sectionId, courseId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Section deleted successfully',
          null,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        const apiError = new ApiError('Failed to delete section', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  courseRegistry.registerPath({
    method: 'delete',
    path: '/courses/{courseId}',
    tags: ['Course'],
    request: {
      params: DeleteCourseSchema.shape.params,
    },
    responses: createApiResponse(z.object({}), 'Success'),
  });
  router.delete(
    '/:courseId',
    sessionMiddleware,
    hasAccessToCourseMiddleware('courseId'),
    roleMiddleware([Role.TEACHER]),
    validateRequest(DeleteCourseSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const courseId = req.params.courseId;

      try {
        await courseService.deleteCourse(courseId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Course deleted successfully',
          null,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        const apiError = new ApiError('Failed to delete course', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  courseRegistry.registerPath({
    method: 'delete',
    path: '/courses/{courseId}/users/{userId}',
    tags: ['Course'],
    request: {
      params: DeleteUserFromCourseSchema.shape.params,
    },
    responses: createApiResponse(z.object({}), 'Success'),
  });
  router.delete(
    '/:courseId/users/:userId',
    sessionMiddleware,
    hasAccessToCourseMiddleware('courseId'),
    roleMiddleware([Role.TEACHER]),
    validateRequest(DeleteUserFromCourseSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const { courseId, userId } = req.params;

      try {
        await courseService.removeUserFromCourse(userId, courseId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'User removed from course successfully',
          null,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        const apiError = new ApiError('Failed to remove user from course', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  courseRegistry.registerPath({
    method: 'patch',
    path: '/courses/:courseId',
    tags: ['Course'],
    request: {
      body: { content: { 'application/json': { schema: CourseUpdateSchema.shape.body } }, description: '' },
      params: CourseUpdateSchema.shape.params,
    },
    responses: createApiResponse(CourseDTOSchema, 'Success'),
  });
  router.patch(
    '/:courseId',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.TEACHER]),
    validateRequest(CourseUpdateSchema),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        logger.trace('[CourseRouter] - [/update] - Session context is missing, sending error response');
        return next(UNAUTHORIZED);
      }

      try {
        const courseId = req.params.courseId;

        // Obtener datos para actualizar
        const courseUpdateData: CourseUpdateDTO = {
          ...req.body,
        };

        logger.trace(`[CourseRouter] - [/update] - Updating course with ID: ${courseId}`);

        const updatedCourse: CourseDTO = await courseService.update(courseId, courseUpdateData);
        logger.trace(`[CourseRouter] - [/update] - Course updated: ${JSON.stringify(updatedCourse)}. Sending response`);

        // Obtener el instituteId a través del teacher
        const instituteId = await teacherService.getInstituteId(updatedCourse.teacherUserId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Course updated successfully',
          updatedCourse,
          StatusCodes.OK
        );
        connector_sync(instituteId, 'course', updatedCourse.id, 'update');
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

  return router;
})();
