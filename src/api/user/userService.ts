import { courseService } from '@/api/course/courseService';
import { DirectorModel } from '@/api/director/directorModel';
import { InstituteDTO, InstituteModel } from '@/api/institute/instituteModel';
import { StudentModel } from '@/api/student/studentModel';
import { TeacherModel } from '@/api/teacher/teacherModel';
import { User, UserCreation, UserDTO, UserModel } from '@/api/user/userModel';
import { userRepository } from '@/api/user/userRepository';
import { Role } from '@/common/models/role';

import { InvalidCredentialsError } from '../auth/authModel';
import { directorRepository } from '../director/directorRepository';
import { teacherRepository } from '../teacher/teacherRepository';

export const userService = {
  // Retrieves all users from the database
  findAll: async (): Promise<UserDTO[]> => {
    const users: User[] = await userRepository.findAllAsync();
    return users.map((user: User) => user.toDto());
  },

  getHashedPassword: async (id: string): Promise<string> => {
    const password: string = await userRepository.getHashedPassword(id);
    return password;
  },
  // Retrieves a single user by their ID
  findById: async (id: string): Promise<any> => {
    const user: User = await userRepository.findByIdAsync(id);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    let instituteId: any = null;
    let learningProfile: string | null = null;

    // Verifica el rol del usuario
    if (user.role === Role.DIRECTOR) {
      const director = await DirectorModel.findOne({ user: { _id: id } }).exec();
      if (director) {
        instituteId = director.institute;
      }
    } else if (user.role === Role.TEACHER) {
      const teacher = await TeacherModel.findOne({ user: { _id: id } }).exec();
      if (teacher) {
        instituteId = teacher?.institute;
      }
    } else if (user.role === Role.STUDENT) {
      const student = await StudentModel.findOne({ user: { _id: id } }).exec();
      if (student) {
        instituteId = student?.institute;
        learningProfile = student.learningProfile;
      }
    }

    // Trae la información de la institución si existe
    let institute: InstituteDTO | null = null;
    if (instituteId) {
      const foundInstitute = await InstituteModel.findById(instituteId).exec();
      if (foundInstitute) {
        institute = foundInstitute.toDto();
      }
    }

    let requiresSurvey: boolean | null = null;
    if (user.role === 'TEACHER' || user.role === 'STUDENT') {
      const currentDate = new Date();
      const nextDateSurvey = user.nextDateSurvey ? new Date(user.nextDateSurvey as any) : null;
      requiresSurvey = nextDateSurvey ? currentDate >= nextDateSurvey : false;
    }

    // Retorna el UserDTO con la información adicional
    return {
      ...user.toDto(),
      ...(institute && { institute }), // Solo agrega `institute` si no es `null` o `undefined`
      ...(learningProfile && { learningProfile }), // Solo agrega `learningProfile` si no es `null` o `undefined`
      ...{ requiresSurvey },
    };
  },

  // Retrieves a single user by their email
  findByEmail: async (email: string): Promise<any> => {
    const user: User | null = await userRepository.findByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const userId = user._id.toString();
    let instituteId: any = null;
    let learningProfile: string | null = null;

    // Verifica el rol del usuario
    if (user.role === Role.DIRECTOR) {
      const director = await DirectorModel.findOne({ user: { _id: userId } }).exec();
      if (director) {
        instituteId = director.institute;
      }
    } else if (user.role === Role.TEACHER) {
      const teacher = await TeacherModel.findOne({ user: { _id: userId } }).exec();
      if (teacher) {
        instituteId = teacher?.institute;
      }
    } else if (user.role === Role.STUDENT) {
      const student = await StudentModel.findOne({ user: { _id: userId } }).exec();
      if (student) {
        instituteId = student?.institute;
        learningProfile = student.learningProfile;
      }
    }

    // Trae la información de la institución si existe
    let institute: InstituteDTO | null = null;
    if (instituteId) {
      const foundInstitute = await InstituteModel.findById(instituteId).exec();
      if (foundInstitute) {
        institute = foundInstitute.toDto();
      }
    }

    let requiresSurvey: boolean | null = null;
    if (user.role === 'TEACHER' || user.role === 'STUDENT') {
      const currentDate = new Date();
      const nextDateSurvey = user.nextDateSurvey ? new Date(user.nextDateSurvey as any) : null;
      requiresSurvey = nextDateSurvey ? currentDate >= nextDateSurvey : false;
    }

    // Retorna el UserDTO con la información adicional
    return {
      ...user.toDto(),
      ...(institute && { institute }), // Solo agrega `institute` si no es `null` o `undefined`
      ...(learningProfile && { learningProfile }), // Solo agrega `learningProfile` si no es `null` o `undefined`
      ...{ requiresSurvey },
    };
  },

  create: async (user: UserCreation): Promise<UserDTO> => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const userWithSurveyFields = {
      ...user,
      nextDateSurvey: nextMonth, // La fecha de la encuesta es en un min
    };

    const createdUser: User = await userRepository.create(userWithSurveyFields);
    return createdUser.toDto();
  },

  getAllStudents: async (userId: string): Promise<UserDTO[]> => {
    const user: User = await userRepository.findByIdAsync(userId);

    let instituteId = null;
    if (user.role === Role.DIRECTOR) {
      instituteId = await directorRepository.getInstituteId(userId);
    } else if (user.role === Role.TEACHER) {
      const teacher = await teacherRepository.findByUserIdAsync(userId);
      instituteId = teacher.institute;
    }
    const users = await userRepository.findUsersByRoleAndInstitute(Role.STUDENT, instituteId);
    return users.map((user) => user.toDto());
  },

  async updateUserProfile(userId: string, profilePicture: string): Promise<UserDTO> {
    const updatedUser = await userRepository.updateUserProfile(userId, profilePicture);

    if (!updatedUser) {
      throw new Error('User not found');
    }

    return updatedUser.toDto();
  },

  async updateNextDateSurvey(userId: string, date: Date): Promise<void> {
    await userRepository.updateNextDateSurvey(userId, date);
  },

  async updateUserRole(userId: string, newRole: Role): Promise<UserDTO> {
    // Buscar al usuario por ID
    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Obtener el rol actual del usuario
    const currentRole = user.role;

    // Regla 1: Estudiante solo puede ser promovido a Docente
    if (currentRole === Role.STUDENT && newRole !== Role.TEACHER) {
      throw new Error('A student can only be promoted to teacher.');
    }

    // Regla 2: Docente puede ser promovido a Directivo o regresar a Estudiante
    if (currentRole === Role.TEACHER && !(newRole === Role.STUDENT || newRole === Role.DIRECTOR)) {
      throw new Error('A teacher can only be promoted to director or demoted to student.');
    }

    // Actualizar el rol del usuario
    user.role = newRole;

    // Si el usuario es un estudiante y va a ser promovido a docente
    if (currentRole === Role.STUDENT && newRole === Role.TEACHER) {
      // Buscar al estudiante por el userId
      const student = await StudentModel.findOne({ user: userId });

      if (!student) {
        throw new Error('Student not found');
      }

      // Por cada curso en el que esté inscrito el estudiante
      for (const course of student.courses) {
        await courseService.removeUserFromCourse(userId, course.id);
      }

      // Aquí podrías crear el nuevo docente con la información necesaria
      const teacher = new TeacherModel({
        user: userId,
        institute: student.institute,
        courses: [],
      });

      // Opcional: Eliminar al estudiante si ya no es necesario
      await StudentModel.deleteOne({ user: userId });
      await teacher.save();
    }

    //si pasa de teacher a student:
    if (currentRole === Role.TEACHER) {
      // Buscar al docente por el userId
      const teacher = await TeacherModel.findOne({ user: userId });

      if (!teacher) {
        throw new Error('teacher not found');
      }

      // Por cada curso en el que esté inscrito el estudiante
      for (const course of teacher.courses) {
        await courseService.deleteCourse(course.id);
      }

      await TeacherModel.deleteOne({ user: userId });

      if (newRole === Role.STUDENT) {
        const student = new StudentModel({
          user: userId,
          institute: teacher.institute,
          courses: [],
        });

        student.save();
      } else if (newRole === Role.DIRECTOR) {
        const director = new DirectorModel({
          user: userId,
          institute: teacher.institute,
        });
        director.save();
      }
    }
    // Guardar los cambios en la base de datos
    await user.save();

    // Convertir el usuario actualizado a DTO
    const updatedUserDTO = user.toDto();

    return updatedUserDTO;
  },
};
