import { DirectorDTO, DirectorModel } from '@/api/director/directorModel';

export const directorRepository = {
  findByUserIdAsync: async (directorUserId: string): Promise<DirectorDTO> => {
    const director = await DirectorModel.findOne({ user: directorUserId }).exec();
    if (!director) {
      return Promise.reject(new Error('Director not found'));
    }
    return director.toDto();
  },

  getInstituteId: async (directorUserId: string): Promise<string> => {
    const director = await directorRepository.findByUserIdAsync(directorUserId);
    return director.institute.toString();
  },

  findAll: async (): Promise<DirectorDTO[]> => {
    const directors = await DirectorModel.find().populate('user').populate('institute').exec();
    return directors.map((director) => director.toDto());
  },

  findByInstituteId: async (instituteId: string): Promise<DirectorDTO[]> => {
    const directors = await DirectorModel.find({ institute: instituteId }).populate('user').exec();
    return directors.map((director) => director.toDto());
  },
};
