// courseModel.ts

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import mongoose, { Document, Model, Schema } from 'mongoose';
import { z } from 'zod';

import { commonValidations } from '@/common/utils/commonValidation';

extendZodWithOpenApi(z);

/**
 * Course DTO (Data Transfer Object)
 */
export const CourseDTOSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  image: z.string().url(),
  matriculationCode: z.string(),
  teacherUserId: z.string(),
  students: z.array(
    z.object({
      userId: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string(),
    })
  ),
  sections: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        image: z.string(),
        /*
        contents: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
            })
          )
          .optional(),*/
      })
    )
    .optional(),
});
export type CourseDTO = z.infer<typeof CourseDTOSchema>;

/**
 * Course Model Schema Definition
 */
const studentSchemaDefinition = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'Users' },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: false },
  },
  { _id: false }
);
/*
const contentSchemaDefinition = new Schema(
  {
    id: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
  },
  { _id: false }
);
*/
const sectionSchemaDefinition = new Schema(
  {
    id: { type: Schema.Types.ObjectId, ref: 'Section' },
    name: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String, required: true },
    //contents: { type: [contentSchemaDefinition], required: true },
  },
  { _id: false }
);

// Usa el schema definido en sectionModel
const courseModelSchemaDefinition: Record<keyof Omit<CourseDTO, 'id'>, any> = {
  title: { type: String, required: true },
  description: { type: String, required: true },
  image: { type: String, required: true },
  matriculationCode: { type: String },
  teacherUserId: { type: Schema.Types.ObjectId, ref: 'Teachers' },
  students: { type: [studentSchemaDefinition], required: true },
  sections: { type: [sectionSchemaDefinition], required: false }, // Usa el schema de Section
};

// Type used to tell mongoose the shape of the schema available
type ICourseSchemaDefinition = {
  title: string;
  description: string;
  image: string;
  matriculationCode: string;
  teacherUserId: string;
  students: Array<{ userId: string; firstName: string; lastName: string; email: string }>;
  sections?: Array<{
    id: mongoose.Types.ObjectId;
    name: string;
    description: string;
    image: string;
    //contents: Array<{ id: mongoose.Types.ObjectId; title: string }>;
  }>;
};

// Type used to add methods to the schema
interface ICourseSchemaDefinitionMethods {
  toDto(): CourseDTO;
}
type CourseModelDefinition = Model<
  ICourseSchemaDefinition & Document,
  Record<string, never>,
  ICourseSchemaDefinitionMethods
>;

/**
 * Course Model Schema
 */
const courseModelSchema = new Schema<ICourseSchemaDefinition, CourseModelDefinition, ICourseSchemaDefinitionMethods>(
  courseModelSchemaDefinition,
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * Method to convert a Course model to a CourseDTO
 */
courseModelSchema.method('toDto', function (): CourseDTO {
  return {
    id: this._id?.toString(),
    title: this.title?.toString() || '',
    description: this.description?.toString() || '',
    image: this.image?.toString() || '',
    matriculationCode: this.matriculationCode?.toString() || '',
    teacherUserId: this.teacherUserId?.toString() || '',
    students:
      this.students?.map((student) => ({
        userId: student.userId?.toString() || '',
        firstName: student.firstName?.toString() || '',
        lastName: student.lastName?.toString() || '',
        email: student.email?.toString() || '',
      })) || [],
    sections:
      this.sections?.map((section: any) => ({
        id: section.id?.toString() || '',
        name: section.name?.toString() || '',
        description: section.description?.toString() || '',
        image: section.image?.toString() || '',
        /*contents: section.contents.map((content: any) => ({
          id: content.id.toString(),
          title: content.title.toString(),
        })),*/
      })) || [],
  };
});

// Create a new Mongoose model for the Course
export const CourseModel = mongoose.model<ICourseSchemaDefinition, CourseModelDefinition>('Courses', courseModelSchema);

// Let's create a Typescript interface for the Course model
export type Course = ICourseSchemaDefinition & ICourseSchemaDefinitionMethods & Document;

// ----------------------- INPUT VALIDATIONS -----------------------

// Input Validation for 'GET courses/:id' endpoint
export const GetCourseSchema = z.object({
  params: z.object({ id: commonValidations.id }),
});

// Esquema para validar la solicitud de agregar estudiantes a un curso
export const AddStudentsSchema = z.object({
  params: z.object({
    courseId: z.string(),
  }),
  body: z.object({
    studentEmails: z.array(z.string().email()).nonempty(), // Array de emails, no vacío
  }),
});

// Input Validation for 'POST courses/create' endpoint
export const CourseCreationSchema = z.object({
  body: z.object({
    title: z.string(),
    description: z.string().optional(),
    image: z.string().url().optional(),
    studentEmails: z.array(z.string().email()).optional(), // Array de emails
    teacherUserId: z.string().optional(),
  }),
});

export const DeleteCourseSchema = z.object({
  params: z.object({
    courseId: z.string(),
  }),
});

export const DeleteUserFromCourseSchema = z.object({
  params: z.object({
    userId: z.string(),
    courseId: z.string(),
  }),
});
export type CourseCreationDTO = z.infer<typeof CourseCreationSchema.shape.body>;
export type CourseCreation = CourseCreationDTO;

export const CourseUpdateSchema = z.object({
  params: z.object({
    courseId: z.string(),
  }),
  body: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
  }),
});

// Define el esquema Zod para la validación
export const VerifyMatriculationCodeSchema = z.object({
  params: z.object({
    courseId: z.string(), // courseId en la URL
  }),
  body: z.object({
    studentEmail: z.string(),
    matriculationCode: z.string(), // Código de matriculación en el cuerpo
  }),
});

export type CourseUpdateDTO = z.infer<typeof CourseUpdateSchema.shape.body>;
