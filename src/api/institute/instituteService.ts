import { logger } from '@/common/utils/serverLogger';

import { InstituteCreationDTO, InstituteDTO, InstituteModel } from './instituteModel';
import { instituteRepository } from './instituteRepository';

export const instituteService = {
  create: async (instituteData: InstituteCreationDTO): Promise<InstituteDTO> => {
    logger.trace('[InstituteService] - [create] - Start');
    logger.trace(`[InstituteService] - [create] - Creating institute with data: ${JSON.stringify(instituteData)}`);

    const institute = instituteRepository.create(instituteData);

    logger.trace(`[InstituteService] - [create] - Institute created: ${JSON.stringify(institute)}`);
    logger.trace('[InstituteService] - [create] - End');

    return institute;
  },

  findAll: async (): Promise<InstituteDTO[]> => {
    logger.trace('[InstituteService] - [findAll] - Start');
    const institutes = await InstituteModel.find().exec();
    logger.trace(`[InstituteService] - [findAll] - Found ${institutes.length} institutes`);

    const instituteDTOs = instituteRepository.findAll();

    logger.trace('[InstituteService] - [findAll] - End');
    return instituteDTOs;
  },

  findById: async (id: string): Promise<InstituteDTO> => {
    logger.trace(`[InstituteService] - [findById] - Finding institute with id: ${id}`);
    const institute = await instituteRepository.findById(id);
    logger.trace('[InstituteService] - [findById] - End');
    return institute;
  },
};
