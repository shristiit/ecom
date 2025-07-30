import { Schema, model, Types } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser {
  /** Mongo-generated primary key */
  _id: Types.ObjectId;

  username: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'customer';

  /** helper added in the schema */
  comparePassword(pwd: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, unique: true, lowercase: true, required: true },
    email:    { type: String, unique: true, lowercase: true, required: true },
    password_hash: { type: String, required: true },
    role:     { type: String, enum: ['admin', 'customer'], default: 'customer' }
  },
  { timestamps: true }
);

UserSchema.pre('save', async function () {
  if (!this.isModified('password_hash')) return;
  this.password_hash = await bcrypt.hash(this.password_hash, 12);
});

UserSchema.methods.comparePassword = function (pwd: string) {
  return bcrypt.compare(pwd, this.password_hash);
};

export default model<IUser>('User', UserSchema);
