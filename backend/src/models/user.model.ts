import { Schema, model, Types } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser {
  _id: Types.ObjectId;

  username: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'customer';

  storenumber: number;
  storename?: string;
  manager?: string;
  location?: string;
  address?: string;
  deliveryaddress?: string;
  contact?: string;
  companycontact?: string;
  vat?: string;

  comparePassword(pwd: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, unique: true, lowercase: true, trim: true, required: true },
    email: { type: String, unique: true, lowercase: true, trim: true, required: true },
    password_hash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'customer'], default: 'customer' },

   
    storenumber: { type: Number, required: true, min: 0 }, // set min/max if you need 5 digits
    storename: { type: String, trim: true },
    manager: { type: String, trim: true },
    location: { type: String, trim: true },
    address: { type: String, trim: true },
    deliveryaddress: { type: String, trim: true },
    contact: { type: String, trim: true },
    companycontact: { type: String, trim: true },
    vat: { type: String, trim: true },
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
