import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { NextFunction, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { CourseDTOSchema, CourseModel } from '@/api/course/courseModel';
import { StudentFilterSchema, StudentModel, StudentResponseArraySchema } from '@/api/student/studentModel';
import { TeacherModel } from '@/api/teacher/teacherModel';
import { UserCreationMassiveSchema, UserCreationSchema, UserDTO, UserDTOSchema } from '@/api/user/userModel';
import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { checkSessionContext } from '@/common/middleware/checkSessionContext';
import { roleMiddleware } from '@/common/middleware/roleMiddleware';
import { sessionMiddleware, SessionRequest } from '@/common/middleware/session';
import { ApiError } from '@/common/models/apiError';
import { ApiResponse, ResponseStatus } from '@/common/models/apiResponse';
import { LearningProfile } from '@/common/models/learningProfile';
import { Role } from '@/common/models/role';
import { handleApiResponse, validateRequest } from '@/common/utils/httpHandlers';
import { logger } from '@/common/utils/serverLogger';
const UNAUTHORIZED = new ApiError('Unauthorized', StatusCodes.UNAUTHORIZED);

import { connector_sync } from '../connector/connector_sync';
import { studentService } from './studentService';

export const studentRegistry = new OpenAPIRegistry();

studentRegistry.register('Student', UserDTOSchema);
studentRegistry.register('Course', CourseDTOSchema);

export const studentRouter: Router = (() => {
  const router = express.Router();

  studentRegistry.registerPath({
    method: 'post',
    path: '/students/',
    tags: ['Student'],
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
        logger.trace('[StudentRouter] - [/] - Start');
        logger.trace(`[StudentRouter] - [/] - Request to create student: ${JSON.stringify(req.body)}`);

        const directorUserId = sessionContext.user.id;
        const userDTO: UserDTO = await studentService.create(req.body, directorUserId);
        logger.trace(`[StudentRouter] - [/] - Student created: ${JSON.stringify(userDTO)}. Sending response`);

        // Obtener el instituteId del director para sincronizar
        const instituteId = await directorService.getInstituteId(directorUserId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Student created successfully',
          userDTO,
          StatusCodes.CREATED
        );

        connector_sync(instituteId, 'student', userDTO.id, 'create');

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

  studentRegistry.registerPath({
    method: 'post',
    path: '/students/massive',
    tags: ['Student'],
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
        logger.trace('[StudentRouter] - [/] - Start');
        logger.trace(`[StudentRouter] - [/] - Request to create students: ${JSON.stringify(req.body)}`);

        const directorUserId = sessionContext.user.id;
        const studentsDTO = await studentService.createMultiple(req.body, directorUserId);

        logger.trace(`[StudentRouter] - [/] - Students created: ${JSON.stringify(studentsDTO)}. Sending response`);
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Students created successfully',
          studentsDTO,
          StatusCodes.CREATED
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[StudentRouter] - [/] - Error: ${error}`);
        const apiError = new ApiError('Failed to create students', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return res.status(apiError.statusCode).json(apiError);
      } finally {
        logger.trace('[StudentRouter] - [/] - End');
      }
    }
  );

  studentRegistry.registerPath({
    method: 'get',
    path: '/students/',
    tags: ['Student'],
    request: { body: { content: { 'application/json': { schema: UserCreationSchema.shape.body } }, description: '' } },
    responses: createApiResponse(UserDTOSchema, 'Success'),
  });
  router.get(
    '/',
    sessionMiddleware,
    roleMiddleware([Role.DIRECTOR, Role.TEACHER]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        return next(UNAUTHORIZED);
      }

      try {
        const userId = sessionContext.user.id;
        const students = await studentService.getAllStudents(userId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Students retrieved successfully',
          students,
          StatusCodes.OK
        );
        res.status(StatusCodes.OK).json(apiResponse);
      } catch (error) {
        const apiError = new ApiError('Failed to retrieve students', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  studentRegistry.registerPath({
    method: 'get',
    path: '/students/me/courses/',
    tags: ['Student'],
    responses: createApiResponse(z.array(CourseDTOSchema), 'Success'),
  });
  router.get(
    '/me/courses',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.STUDENT]),

    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const sessionContext = req.sessionContext;

        logger.trace(
          `[StudentRouter] - [/me/courses] - Retrieving courses for student with id: ${sessionContext?.user?.id}`
        );

        // Buscar todos los cursos donde el id del estudiante está en el array de students
        const courses = await CourseModel.find({ 'students.userId': sessionContext?.user?.id }).exec();
        logger.trace(`[StudentRouter] - [/me/courses] - Found courses: ${JSON.stringify(courses)}`);

        // Convertir los cursos a su formato DTO
        const coursesDTO = courses.map((course) => course.toDto());

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Courses retrieved successfully',
          coursesDTO,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[StudentRouter] - [/me/courses] - Error: ${error}`);
        const apiError = new ApiError('Failed to retrieve courses', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  studentRegistry.registerPath({
    method: 'get',
    path: '/students/me/learning-profile',
    tags: ['Student'],
    responses: createApiResponse(z.object({ learningProfile: z.nativeEnum(LearningProfile) }), 'Success'),
  });

  router.get(
    '/me/learning-profile',
    sessionMiddleware,
    checkSessionContext,
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        return next(UNAUTHORIZED);
      }
      try {
        const userId = sessionContext.user.id;

        const learningProfile = await studentService.getLearningProfile(userId);

        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Learning profile retrieved successfully',
          { learningProfile },
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[StudentRouter] - [/students/me/learning-profile] - Error: ${error}`);
        const apiError = new ApiError('Failed to retrieve learning profile', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  studentRegistry.registerPath({
    method: 'get',
    path: '/students/learning-profile',
    tags: ['Student'],
    request: {
      params: StudentFilterSchema,
    },
    responses: createApiResponse(StudentResponseArraySchema, 'Success'),
  });
  router.get(
    '/learning-profile',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.TEACHER, Role.DIRECTOR]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      const sessionContext = req.sessionContext;
      if (!sessionContext?.user?.id) {
        return next(UNAUTHORIZED);
      }
      try {
        const { courseId, studentUserId, learningProfile, teacherUserId } = req.query;
        let teacherLogged = '';
        if (sessionContext.user.role == Role.TEACHER) {
          teacherLogged = sessionContext.user.id;
        }

        // Si el rol es Teacher y está tratando de filtrar por teacherUserId, devolvemos un error
        if (sessionContext.user.role === Role.TEACHER && teacherUserId) {
          return next(new ApiError('Unauthorized filter', StatusCodes.FORBIDDEN));
        }

        const students = await studentService.getStudentsByFilters(
          {
            courseId: courseId as string,
            studentUserId: studentUserId as string,
            learningProfile: learningProfile as string,
            teacherUserId: teacherUserId as string,
          },
          teacherLogged
        );
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Students retrieved successfully',
          students,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        logger.error(`[StudentRouter] - [/students/me/learning-profile] - Error: ${error}`);
        const apiError = new ApiError('Failed to retrieve students', StatusCodes.INTERNAL_SERVER_ERROR, error);
        return next(apiError);
      }
    }
  );

  router.get(
    '/me/courses-to-matriculate',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.STUDENT]),
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const sessionContext = req.sessionContext;
        if (!sessionContext?.user?.id) {
          logger.trace('[TeacherRouter] - [/me/courses] - Session context is missing, sending error response');
          return next(UNAUTHORIZED);
        }

        const studentUserId = sessionContext.user.id;

        // Busca el estudiante
        const student = await StudentModel.findOne({ user: studentUserId });
        if (!student) {
          return res.status(404).json({ message: 'Estudiante no encontrado' });
        }

        // Obtiene los IDs de los cursos en los que el estudiante está inscrito
        const studentCoursesIds = student.courses.map((course) => course.id.toString());

        // Busca los docentes que pertenezcan al mismo instituto que el estudiante
        const studentInstituteId = student.institute;
        const teachers = await TeacherModel.find({ institute: studentInstituteId })
          .populate('user')
          .populate('courses')
          .exec();

        // Extrae los cursos de cada docente
        const allCourses = teachers.flatMap((teacher) => teacher.courses);

        // Filtra los cursos en los que el estudiante no está inscrito
        const coursesToMatriculate = allCourses.filter((course) => !studentCoursesIds.includes(course.id.toString()));

        // Responde con los cursos en los que el estudiante no está inscrito
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Courses available for enrollment retrieved successfully',
          coursesToMatriculate,
          StatusCodes.OK
        );
        handleApiResponse(apiResponse, res);
      } catch (error) {
        console.error('Error al obtener los cursos:', error);
        return res.status(500).json({ message: 'Error al obtener los cursos' });
      }
    }
  );

  return router;
})();
