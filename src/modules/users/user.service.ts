import { User } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { UpdateProfileInput } from './user.validation';

export async function getUserById(id: string) {
  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
}

export async function updateUser(id: string, input: UpdateProfileInput) {
  const user = await getUserById(id);
  Object.assign(user, input);
  await user.save();
  return user;
}
