import { Types } from 'mongoose';
import mongoose from 'mongoose';

import { ContentCreationDTO, ContentDTO, ContentModel } from '@/api/course/content/contentModel';
import {
  Course,
  CourseCreation,
  CourseCreationDTO,
  CourseDTO,
  CourseModel,
  CourseUpdateDTO,
} from '@/api/course/courseModel';
import { SectionCreationDTO, SectionDTO, SectionModel, SectionUpdateDTO } from '@/api/course/section/sectionModel';
import { StudentModel } from '@/api/student/studentModel';
import { TeacherModel } from '@/api/teacher/teacherModel';
import { UserModel } from '@/api/user/userModel';
import { PublicationType } from '@/common/models/publicationType';

export const courseRepository = {
  // Retrieves all courses from the database
  findAllAsync: async (): Promise<Course[]> => CourseModel.find<Course>(),

  // Retrieves a course by its ID
  findByIdAsync: async (id: string): Promise<Course> => {
    const course = await CourseModel.findById<Course>(id);
    if (!course) {
      return Promise.reject(new Error('Course not found'));
    }
    return course;
  },

  getContentById: async (id: string): Promise<ContentDTO> => {
    const content = await ContentModel.findById(id).exec();

    if (!content) {
      return Promise.reject(new Error('Content not found'));
    }

    return content.toDto();
  },

  async findStudentsByEmails(emails: string[]): Promise<any[]> {
    return UserModel.find({ email: { $in: emails } }, { _id: 1, firstName: 1, lastName: 1, email: 1 });
  },

  // Creates a new course
  create: async (course: CourseCreation): Promise<Course> => {
    const newCourse = await CourseModel.create<CourseCreationDTO>(course);
    return courseRepository.findByIdAsync(newCourse.id);
  },

  async findCoursesByTeacherId(teacherUserId: string): Promise<CourseDTO[]> {
    const courses = await CourseModel.find({ teacherUserId: teacherUserId }).exec();
    return courses.map((course) => course.toDto());
  },

  async findByInstituteId(instituteId: string): Promise<CourseDTO[]> {
    // Obtener todos los profesores del instituto
    const teachers = await TeacherModel.find({ institute: instituteId }).exec();
    const teacherIds = teachers.map((teacher) => teacher.user);

    // Obtener todos los cursos de esos profesores
    const courses = await CourseModel.find({ teacherUserId: { $in: teacherIds } }).exec();
    return courses.map((course) => course.toDto());
  },

  addSectionToCourse: async (courseId: string, sectionData: SectionCreationDTO): Promise<SectionDTO> => {
    const newSection = new SectionModel({
      name: sectionData.name,
      description: sectionData.description,
      image: sectionData.image,
      visible: sectionData.visible,
    });

    const savedSection = await newSection.save();

    const course = await CourseModel.findById(courseId).exec();

    if (!course) {
      throw new Error('Course not found');
    }

    course.sections = course.sections || [];

    course.sections.push({
      id: savedSection._id as Types.ObjectId,
      name: newSection.name,
      description: newSection.description ?? '',
      image: newSection.image,
    });

    await course.save();
    return newSection.toDto();
  },

  getSectionsOfCourse: async (courseId: string): Promise<any[]> => {
    const course = await CourseModel.findById(courseId).populate('sections').exec();

    if (!course) {
      throw new Error('Course not found');
    }

    const sectionIds = course.sections?.map((section) => section.id);

    const objectIdArray = sectionIds?.map((id) => new mongoose.Types.ObjectId(id));

    const sections = await SectionModel.find({ _id: { $in: objectIdArray } }).exec();

    const sectionDtos = sections.map((section) => ({
      id: section.id.toString(),
      name: section.name,
      description: section.description,
      visible: section.visible,
      image: section.image,
      contents: section.contents?.map((content) => ({
        id: content.id.toString(),
        title: content.title,
      })),
    }));

    return sectionDtos;
  },

  addContentToSection: async (
    sectionId: string,
    contentData: ContentCreationDTO,
    key: string,
    preSignedUrl: string
  ): Promise<any> => {
    const isVisible = contentData.publicationType === PublicationType.AUTOMATIC;

    const newContent = new ContentModel({
      title: contentData.title,
      sectionId,
      key: key,
      publicationType: contentData.publicationType,
      publicationDate: contentData.publicationDate,
      visible: isVisible,
      status: 'PENDING',
    });

    const savedContent = newContent.save();

    const section = await SectionModel.findById(sectionId).exec();

    if (!section) {
      throw new Error('Section not found');
    }

    section.contents = section?.contents || [];

    section.contents.push({
      id: (await savedContent)._id as Types.ObjectId,
      title: (await savedContent).title,
    });

    await section.save();

    return {
      ...newContent.toDto(),
      preSignedUrl,
    };
  },

  async addStudentsToCourse(courseId: string, students: any[]): Promise<Course> {
    const course = await CourseModel.findById(courseId);
    if (!course) {
      throw new Error('Course not found');
    }

    course.students.push(...students);
    await course.save();

    return course;
  },

  getStudentsOfCourse: async (courseId: string): Promise<any[]> => {
    const course = await CourseModel.findById(courseId).populate('students').exec();

    if (!course) {
      throw new Error('Course not found');
    }

    const studentIds = course.students?.map((student) => student.userId);

    const objectIdArray = studentIds?.map((id) => new mongoose.Types.ObjectId(id));

    const students = await UserModel.find({ _id: { $in: objectIdArray } }).exec();

    const studentDtos = students.map((student) => ({
      id: student.id.toString(),
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
    }));

    return studentDtos;
  },

  getContentsBySectionId: async (sectionId: string): Promise<ContentDTO[] | null> => {
    const contents = await ContentModel.find({ sectionId }).exec();

    if (!contents) {
      return null;
    }

    // Mapeamos cada documento a un DTO utilizando el método toDto
    return contents.map((content) => content.toDto());
  },

  deleteCourse: async (courseId: string): Promise<void> => {
    await StudentModel.updateMany({ 'courses.id': courseId }, { $pull: { courses: { id: courseId } } });
    await TeacherModel.updateMany({ 'courses.id': courseId }, { $pull: { courses: { id: courseId } } });
    await CourseModel.deleteOne({ _id: courseId });
  },

  removeUserFromCourse: async (userId: string, courseId: string): Promise<void> => {
    await CourseModel.updateOne({ _id: courseId }, { $pull: { students: { userId: userId } } });
    await StudentModel.updateOne({ user: userId }, { $pull: { courses: { id: courseId } } });
  },

  async updateSection(courseId: string, sectionId: string, updateData: SectionUpdateDTO): Promise<void> {
    // Buscar el curso por su ID
    const course = await CourseModel.findById(courseId).exec();
    if (!course) {
      throw new Error('Course not found');
    }

    // Buscar la sección dentro del array de secciones
    const section = course.sections?.find((section) => section.id.toString() === sectionId);
    if (!section) {
      throw new Error('Section not found');
    }

    // Actualizar los campos permitidos
    if (updateData.name) section.name = updateData.name;
    if (updateData.description !== undefined) section.description = updateData.description;

    // Guardar los cambios en el curso
    await course.save();
  },

  updateCourse: async (courseId: string, updateData: Partial<CourseUpdateDTO>): Promise<Course> => {
    const updatedCourse = await CourseModel.findByIdAndUpdate(courseId, updateData, { new: true }).exec();

    if (!updatedCourse) {
      throw new Error(`Course with id ${courseId} not found`);
    }

    return updatedCourse;
  },
};
