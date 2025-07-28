import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema(
  {
    username:  { type: String, required: true, unique: true, trim: true },
    email:     { type: String, required: true, unique: true, lowercase: true },
    password:  { type: String, required: true },            // hashed
    firstName: String,
    lastName:  String,
    role:      { type: String, enum: ['admin', 'customer'], default: 'customer' },
  },
  { timestamps: true }
);

// helpers 
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

export default mongoose.model('User', userSchema);
