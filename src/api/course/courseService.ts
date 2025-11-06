import { randomUUID } from 'crypto';
import { Types } from 'mongoose';

import { ContentCreationDTO, ContentDTO } from '@/api/course/content/contentModel';
import { Course, CourseCreation, CourseDTO, CourseModel, CourseUpdateDTO } from '@/api/course/courseModel';
import { courseRepository } from '@/api/course/courseRepository';
import { SectionCreationDTO, SectionDTO, SectionUpdateDTO } from '@/api/course/section/sectionModel';
import { studentRepository } from '@/api/student/studentRepository';
import { teacherRepository } from '@/api/teacher/teacherRepository';
import { s3Get, s3Put } from '@/common/utils/awsManager';

import { sectionRepository } from './section/sectionRepository';

const generateMatriculationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const courseService = {
  // Retrieves a course by its ID
  findById: async (id: string): Promise<CourseDTO> => {
    const course: Course | null = await courseRepository.findByIdAsync(id);
    if (!course) {
      throw new Error('Course not found');
    }
    return course.toDto();
  },

  create: async (course: CourseCreation, teacherUserId: string): Promise<CourseDTO> => {
    const matriculationCode = generateMatriculationCode();
    const { studentEmails = [], ...courseData } = course;

    const userStudents = await courseRepository.findStudentsByEmails(studentEmails);

    const courseWithCode = {
      ...courseData,
      matriculationCode,
      teacherUserId,
      students: userStudents.map((student) => ({
        userId: student._id as Types.ObjectId,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
      })),
    };

    const createdCourse: Course = await courseRepository.create(courseWithCode);

    // Update teacher's courses
    await teacherRepository.addCourseToTeacher(teacherUserId, {
      id: createdCourse._id as Types.ObjectId,
      courseName: createdCourse.title,
    });

    for (const userStudent of userStudents) {
      await studentRepository.addCourseToStudent(userStudent._id, {
        id: createdCourse._id as Types.ObjectId,
        courseName: createdCourse.title,
      });
    }

    return createdCourse.toDto();
  },

  async addStudentsToCourse(courseId: string, studentEmails: string[]): Promise<CourseDTO> {
    // Obtener el curso
    const course = await courseRepository.findByIdAsync(courseId);

    if (!course) {
      throw new Error('Course not found');
    }

    // Filtrar los estudiantes que ya existen en el curso
    const existingEmails = new Set(course.students.map((student) => student.email));
    const newStudentEmails = studentEmails.filter((email) => !existingEmails.has(email));

    if (newStudentEmails.length === 0) {
      return course.toDto(); // Si no hay estudiantes nuevos, retornar el curso tal como está
    }

    // Obtener los estudiantes desde la base de datos para los correos nuevos
    const userStudents = await courseRepository.findStudentsByEmails(newStudentEmails);

    if (userStudents.length !== newStudentEmails.length) {
      throw new Error('One or more student emails do not exist');
    }

    const studentData = userStudents.map((student) => ({
      userId: student.id.toString(),
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
    }));

    // Agregar los nuevos estudiantes al curso
    const updatedCourse = await courseRepository.addStudentsToCourse(courseId, studentData);

    // Agregar el curso a los nuevos estudiantes
    for (const userStudent of userStudents) {
      await studentRepository.addCourseToStudent(userStudent._id, {
        id: updatedCourse._id as Types.ObjectId,
        courseName: updatedCourse.title,
      });
    }

    return updatedCourse.toDto();
  },

  async verifyMatriculationCode(courseId: string, matriculationCode: string): Promise<boolean> {
    const course = await CourseModel.findById(courseId);

    if (!course) {
      throw new Error('Course not found');
    }

    // Compara el código de matriculación
    return course.matriculationCode === matriculationCode;
  },

  async addStudentWithMatriculationCode(
    courseId: string,
    matriculationCode: string,
    studentEmails: string[]
  ): Promise<CourseDTO> {
    if (await courseService.verifyMatriculationCode(courseId, matriculationCode)) {
      return this.addStudentsToCourse(courseId, studentEmails);
    } else {
      throw new Error('Matriculation code is incorrect');
    }
  },

  async findCoursesByTeacherId(teacherUserId: string): Promise<CourseDTO[]> {
    return courseRepository.findCoursesByTeacherId(teacherUserId);
  },

  async findCoursesByInstituteId(instituteId: string): Promise<CourseDTO[]> {
    return courseRepository.findByInstituteId(instituteId);
  },

  async addSectionToCourse(courseId: string, sectionData: SectionCreationDTO): Promise<SectionDTO> {
    return await courseRepository.addSectionToCourse(courseId, sectionData);
  },

  async getSectionsOfCourse(courseId: string): Promise<any> {
    return await courseRepository.getSectionsOfCourse(courseId);
  },

  async getStudentsOfCourse(courseId: string): Promise<any> {
    return await courseRepository.getStudentsOfCourse(courseId);
  },

  async addContentToSection(
    sectionId: string,
    contentData: ContentCreationDTO,
    file: Express.Multer.File
  ): Promise<ContentDTO> {
    const key = `${randomUUID()}`.toString();
    const preSignedUrl = await s3Put(key, file);
    return await courseRepository.addContentToSection(sectionId, contentData, key, preSignedUrl);
  },

  getContentsWithPresignedUrls: async (sectionId: string) => {
    const contents = await courseRepository.getContentsBySectionId(sectionId);

    if (!contents) {
      return [];
    }

    const contentsWithUrls = await Promise.all(
      contents.map(async (content) => {
        const presignedUrl = await s3Get(content.key);
        return {
          ...content,
          presignedUrl,
        };
      })
    );

    return contentsWithUrls;
  },

  getContentById: async (id: string) => {
    const content = await courseRepository.getContentById(id);

    if (!content) {
      throw new Error('Content not found');
    }

    const presignedUrl = await s3Get(content.key);

    return {
      ...content,
      presignedUrl,
    };
  },

  deleteCourse: async (courseId: string): Promise<void> => {
    await courseRepository.deleteCourse(courseId);
  },

  removeUserFromCourse: async (userId: string, courseId: string): Promise<void> => {
    await courseRepository.removeUserFromCourse(userId, courseId);
  },

  async updateSection(courseId: string, sectionId: string, updateData: SectionUpdateDTO): Promise<SectionDTO> {
    await courseRepository.updateSection(courseId, sectionId, updateData);
    const updatedSection = await sectionRepository.updateSection(sectionId, updateData);
    return updatedSection;
  },

  update: async (courseId: string, courseUpdateData: CourseUpdateDTO): Promise<CourseDTO> => {
    const course = await courseRepository.findByIdAsync(courseId);

    if (!course) {
      throw new Error('Course not found');
    }

    // Actualiza los campos permitidos
    if (courseUpdateData.title) course.title = courseUpdateData.title;
    if (courseUpdateData.description) course.description = courseUpdateData.description;

    if (courseUpdateData.image) course.image = courseUpdateData.image;
    await course.save();

    return course.toDto();
  },
};
