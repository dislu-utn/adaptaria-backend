import { Types } from 'mongoose';

import { CourseModel } from '@/api/course/courseModel';
import { Student, StudentFilter, StudentModel } from '@/api/student/studentModel';

export const studentRepository = {
  findById: async (id: string): Promise<Student | null> => {
    const student = await StudentModel.findById<Student>(id);
    if (!student) {
      return Promise.reject(new Error('student not found'));
    }
    return student;
  },

  findByInstituteId: async (instituteId: string): Promise<Student[]> => {
    return StudentModel.find({ institute: instituteId }).populate('user').exec();
  },

  addCourseToStudent: async (
    studentUserId: Types.ObjectId,
    course: { id: Types.ObjectId; courseName: string }
  ): Promise<void> => {
    await StudentModel.updateOne({ user: studentUserId }, { $push: { courses: course } }).exec();
  },

  findStudentsByFilters: async (filters: StudentFilter, teacherLogged: string) => {
    const studentFilter: any = {};

    if (teacherLogged != '') {
      const coursesTaughtByTeacher = await CourseModel.find({ teacherUserId: teacherLogged }).select('_id');
      const courseIds = coursesTaughtByTeacher.map((course) => course._id);

      if (courseIds.length > 0) {
        studentFilter['courses.id'] = { $in: courseIds }; // Filtrar los estudiantes que están en estos cursos
      }
    }

    if (filters.courseId) {
      studentFilter['courses.id'] = filters.courseId;
    }

    if (filters.learningProfile) {
      studentFilter['learningProfile'] = filters.learningProfile;
    }

    if (filters.studentUserId) {
      studentFilter['user'] = filters.studentUserId;
    }

    if (filters.teacherUserId) {
      const coursesTaughtByTeacher = await CourseModel.find({ teacherUserId: filters.teacherUserId }).select('_id');
      const courseIds = coursesTaughtByTeacher.map((course) => course._id);

      if (courseIds.length > 0) {
        studentFilter['courses.id'] = { $in: courseIds }; // Filtrar los estudiantes que están en estos cursos
      } else {
        return null;
      }
    }

    const students = await StudentModel.find(studentFilter).populate('user');

    return students;
  },
};
