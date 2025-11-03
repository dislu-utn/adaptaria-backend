import { Profile } from 'passport-google-oauth20';

import { StudentModel } from '@/api/student/studentModel';
import { User, UserCreation, UserCreationDTO, UserModel, UserNotFoundError } from '@/api/user/userModel';

export const userRepository = {
  findAllAsync: async (): Promise<User[]> => UserModel.find<User>(),

  findByIdAsync: async (id: string): Promise<User> => {
    const user = await UserModel.findById<User>(id);
    if (!user) {
      throw new UserNotFoundError('User not found');
    }
    return user;
  },

  getHashedPassword: async (id: string): Promise<string> => {
    const user = await UserModel.findById(id).select('password');
    if (!user) {
      throw new UserNotFoundError('User not found');
    }
    return (user as any).password;
  },

  create: async (user: UserCreation): Promise<User> => {
    const newUser = await UserModel.create<UserCreationDTO>(user);
    return userRepository.findByIdAsync(newUser.id);
  },

  findByEmail: async (email: string): Promise<User | null> => {
    return await UserModel.findOne<User>({ email });
  },

  updateById: async (id: string, user: User): Promise<User> => {
    const updatedUser = await UserModel.findByIdAndUpdate<User>(id, user, { new: true });
    if (!updatedUser) {
      return Promise.reject();
    }
    return updatedUser;
  },

  findUsersByRoleAndInstitute: async (role: string, instituteId: string): Promise<User[]> => {
    // Encuentra los estudiantes por instituteId
    const students = await StudentModel.find({ institute: instituteId }).exec();

    // Extrae los userIds de esos estudiantes
    const userIds = students.map((student) => student.user);

    // Encuentra los usuarios por role y los userIds obtenidos
    return UserModel.find<User>({ role, _id: { $in: userIds } }).exec();
  },

  async updateUserProfile(userId: string, profilePicture: string) {
    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { profilePicture } },
      { new: true, runValidators: true }
    ).exec();
    return updatedUser;
  },

  async updateNextDateSurvey(userId: string, date: Date): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { nextDateSurvey: date });
  },

  loginWithGoogle: async (profile: Profile): Promise<User | null> => {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return null;
    }

    const existingUser = await UserModel.findOne<User>({ email });
    if (!existingUser) {
      return null;
    }
    return existingUser;
  },
};
