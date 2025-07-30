import 'dotenv/config';
import mongoose from 'mongoose';
import { MONGO_URL } from '../config/env';
import User from '../models/user.model';

(async () => {
  await mongoose.connect(MONGO_URL);
  const exists = await User.findOne({ username: 'admin' });
  if (exists) { console.log('Admin exists'); process.exit(); }
  await User.create({
    username: 'admin',
    email:    'admin@ecom.local',
    password_hash: 'changeme',
    role: 'admin'
  });
  console.log('Seeded admin user with password: changeme');
  process.exit();
})();
