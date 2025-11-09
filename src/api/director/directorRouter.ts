import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { NextFunction, Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import { TeacherModel } from '@/api/teacher/teacherModel';
import { UserDirectorCreationSchema, UserDTO, UserDTOSchema } from '@/api/user/userModel';
import { checkSessionContext } from '@/common/middleware/checkSessionContext';
import { roleMiddleware } from '@/common/middleware/roleMiddleware';
import { sessionMiddleware, SessionRequest } from '@/common/middleware/session';
import { ApiError } from '@/common/models/apiError';
import { ApiResponse, ResponseStatus } from '@/common/models/apiResponse';
import { Role } from '@/common/models/role';
import { handleApiResponse, validateRequest } from '@/common/utils/httpHandlers';
import { logger } from '@/common/utils/serverLogger';

import { connector_sync } from '../connector/connector_sync';
import { DirectorModel } from './directorModel';
import { directorService } from './directorService';
const UNAUTHORIZED = new ApiError('Unauthorized', StatusCodes.UNAUTHORIZED);

export const directorRegistry = new OpenAPIRegistry();

directorRegistry.register('Director', UserDTOSchema);

export const directorRouter: Router = (() => {
  const router = express.Router();

  router.post(
    '/',
    validateRequest(UserDirectorCreationSchema),
    roleMiddleware([Role.ADMIN, Role.DIRECTOR]),
    async (req: Request, res: Response) => {
      try {
        logger.trace('[DirectorRouter] - [/:instituteId] - Start');
        const userDTO: UserDTO = await directorService.create(req.body);

        logger.trace(
          `[DirectorRouter] - [/:instituteId] - Director created: ${JSON.stringify(userDTO)}. Sending response`
        );
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'Director created successfully',
          userDTO,
          StatusCodes.CREATED
        );

        // Obtener el instituteId del director que está creando
        const adminDirectorId = sessionContext.user.id;
        const instituteId = await directorService.getInstituteId(adminDirectorId);

        connector_sync(instituteId, 'director', userDTO.id, 'create');

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

  router.get('/', roleMiddleware([Role.ADMIN, Role.DIRECTOR]), async (req: Request, res: Response) => {
    try {
      logger.trace('[DirectorRouter] - [GET /] - Start');
      const directors = await directorService.findAll();

      logger.trace(`[DirectorRouter] - [GET /] - Found ${directors.length} directors. Sending response`);
      const apiResponse = new ApiResponse(
        ResponseStatus.Success,
        'Directors retrieved successfully',
        directors,
        StatusCodes.OK
      );
      handleApiResponse(apiResponse, res);
    } catch (error) {
      logger.error(`[DirectorRouter] - [GET /] - Error: ${error}`);
      const apiError = new ApiError('Failed to retrieve directors', StatusCodes.INTERNAL_SERVER_ERROR, error);
      return res.status(apiError.statusCode).json(apiError);
    } finally {
      logger.trace('[DirectorRouter] - [GET /] - End');
    }
  });

  router.get(
    '/courses',
    sessionMiddleware,
    checkSessionContext,
    roleMiddleware([Role.DIRECTOR]), // Asegura que solo los directores puedan acceder
    async (req: SessionRequest, res: Response, next: NextFunction) => {
      try {
        const sessionContext = req.sessionContext;
        if (!sessionContext?.user?.id) {
          logger.trace('[TeacherRouter] - [/me/courses] - Session context is missing, sending error response');
          return next(UNAUTHORIZED);
        }

        // Obtén el ID del director logueado desde el contexto de la sesión
        const directorId = sessionContext.user.id;

        // Busca el director en la base de datos para obtener el instituteId
        const director = await DirectorModel.findOne({ user: directorId });
        if (!director) {
          return res.status(404).json({ message: 'Director no encontrado' });
        }

        // Busca los docentes donde pertenezcan al mismo instituto que el director
        const directorInstituteId = director.institute;

        const teachers = await TeacherModel.find({ institute: directorInstituteId })
          .populate('user')
          .populate('courses')
          .exec();

        // Extrae los cursos de cada docente
        const courses = teachers.flatMap((teacher) => teacher.courses);
        const apiResponse = new ApiResponse(
          ResponseStatus.Success,
          'courses retrieved successfully',
          courses,
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
