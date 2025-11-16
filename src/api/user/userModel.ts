import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import mongoose, { InferRawDocType, Model, Schema } from 'mongoose';
import { z } from 'zod';

import { Role } from '@/common/models/role';
import { commonValidations } from '@/common/utils/commonValidation';

extendZodWithOpenApi(z);

/**
 * User DTO (Data Transfer Object)
 * This is the shape of the data that will be sent or received from the API
 * Should not contain any sensitive information such as passwords, auditory fields, etc.
 *
 * It should be serializable, so it should not contain any functions, methods or any other non-serializable data
 *
 * Read more about DTO here: https://medium.com/@valksoft/uso-de-dto-vs-modelo-c1ae1d1797ea
 */
export const UserDTOSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  role: z.nativeEnum(Role),
  document: z.object({
    type: z.string(),
    number: z.string(),
  }),
  profilePicture: z.string().default(''), // Campo opcional con valor por defecto
});
export type UserDTO = z.infer<typeof UserDTOSchema>; // Inferred type of UserDTO

/**
 * User Model Schema Definition
 * This is the shape of the data that will be stored in the database
 * It must not contain any auditing fields such as createdAt, updatedAt, because Mongoose will add them automatically
 *
 * Read more about Mongoose Schemas here:
 * - https://mongoosejs.com/docs/typescript/schemas.html
 * - https://mongoosejs.com/docs/guide.html
 */
const userModelSchemaDefinition = {
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: Role },
  document: {
    type: {
      type: String,
      required: true,
    },
    number: {
      type: String,
      required: true,
    },
  },
  profilePicture: { type: String, default: '' }, // Campo de foto de perfil opcional con valor por defecto
  forcePasswordReset: { type: Boolean, default: true },
  nextDateSurvey: { type: Date },
};

// Type used to tell mongoose the shape of the schema available
type IUserSchemaDefinition = Omit<UserDTO, 'id'>;
// Type used to add methods to the schema
interface IUserSchemaDefinitionMethods {
  toDto(): UserDTO;
}
type UserModelDefinition = Model<IUserSchemaDefinition & Document, Record<string, never>, IUserSchemaDefinitionMethods>;

/**
 * User Model Schema
 * This is the Mongoose schema that will be used to create the User model
 * It contains the schema definition and some options
 *
 * For auditing fields, you can use the timestamps option to automatically add createdAt and updatedAt fields
 * Also, you can use the versionKey option to disable the __v field
 */
const userModelSchema = new Schema<IUserSchemaDefinition, UserModelDefinition, IUserSchemaDefinitionMethods>(
  userModelSchemaDefinition,
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * Method to convert a User model to a UserDTO
 * This makes you able to convert a User model to a UserDTO easily
 *
 * Read more about Mongoose methods here: https://mongoosejs.com/docs/typescript/statics-and-methods.html
 */
userModelSchema.method('toDto', function (): UserDTO {
  return {
    id: this._id.toString(),
    firstName: this.firstName.toString(),
    lastName: this.lastName.toString(),
    role: this.role.toString() as Role,
    document: {
      type: this.document.type.toString(),
      number: this.document.number.toString(),
    },
    email: this.email.toString(),
    profilePicture: this.profilePicture, // Devuelve el campo de foto de perfil
  };
});

// Create a new Mongoose model for the User
export const UserModel = mongoose.model<IUserSchemaDefinition, UserModelDefinition>('Users', userModelSchema);

// Let's create a Typescript interface for the User model
export type User = InferRawDocType<typeof userModelSchemaDefinition> & IUserSchemaDefinitionMethods;
//export type User = typeof UserModel;

// ----------------------- INPUT VALIDATIONS -----------------------

// Input Validation for 'GET users/:id' endpoint
export const GetUserSchema = z.object({
  params: z.object({ id: commonValidations.id }),
});

// Input Validation for 'GET users/get_by_email/:email' endpoint
export const GetUserByEmailSchema = z.object({
  params: z.object({ email: z.string().email('Invalid email format') }),
});

// Validación para el tipo de documento
const DocumentTypeEnum = z.enum(['DNI', 'Pasaporte']);

// Esquema de validación para el documento
const DocumentSchema = z
  .object({
    type: DocumentTypeEnum,
    number: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'DNI' && !/^\d{1,8}$/.test(data.number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DNI must have a maximum of 8 digits.',
        path: ['number'], // Marca el error en el campo 'number'
      });
    }
    if (data.type === 'Pasaporte' && !/^[a-zA-Z0-9]+$/.test(data.number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passport must be alphanumeric.',
        path: ['number'], // Marca el error en el campo 'number'
      });
    }
  });

// Input Validation for 'POST users/register' endpoint
export const UserCreationSchema = z.object({
  body: z.object({
    firstName: z
      .string()
      .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'First name must contain only letters')
      .min(1, 'First name cannot be empty'),
    lastName: z
      .string()
      .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'Last name must contain only letters')
      .min(1, 'Last name cannot be empty'),
    email: z.string().email('Invalid email format'),
    document: DocumentSchema,
    password: z.string().optional(),
  }),
});

export const UserCreationMassiveSchema = z.object({
  body: z
    .array(
      z.object({
        firstName: z
          .string()
          .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'First name must contain only letters')
          .min(1, 'First name cannot be empty'),
        lastName: z
          .string()
          .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'Last name must contain only letters')
          .min(1, 'Last name cannot be empty'),
        email: z.string().email('Invalid email format'),
        document: DocumentSchema,
      })
    )
    .min(1, 'At least one student must be provided'), // Asegurarse de que al menos un estudiante sea enviado en el array
});

export const UserDirectorCreationSchema = z.object({
  body: z.object({
    firstName: z
      .string()
      .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'First name must contain only letters')
      .min(1, 'First name cannot be empty'),
    lastName: z
      .string()
      .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'Last name must contain only letters')
      .min(1, 'Last name cannot be empty'),
    email: z.string().email('Invalid email format'),
    document: DocumentSchema,
    institute: z.object({
      id: z.string(),
    }),
    password: z.string().optional(),
  }),
});
export type UserCreationDTO = z.infer<typeof UserCreationSchema.shape.body> & { forcePasswordReset?: boolean };
export type UserDirectorCreationDTO = z.infer<typeof UserDirectorCreationSchema.shape.body>;
export type UserCreation = UserCreationDTO & { password: string; role: Role };

// Input Validation for POST /users/login
export const UserLoginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});
export type UserLoginDTO = z.infer<typeof UserLoginSchema.shape.body>;

export const UpdateUserProfileSchema = z.object({
  body: z.object({
    profilePicture: z.string().url().optional(),
    userId: z.string().optional(),
  }),
});

export const SessionTokenSchema = z.object({
  access_token: z.string(),
  requiresSurvey: z.boolean().optional(),
});
export type SessionToken = z.infer<typeof SessionTokenSchema>;

export class UserNotFoundError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export const UpdateUserRoleSchema = z.object({
  body: z.object({
    newRole: z.nativeEnum(Role), // El nuevo rol debe estar dentro del enum de roles
  }),
  params: z.object({
    userId: z.string(), // ID del usuario que inicio sesion
  }),
});
