import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // opts if you want them; defaults are fine in Mongoose ≥ 7
    });
    console.log(' MongoDB connected');
  } catch (err) {
    console.error('  Mongo connection error:', err.message);
    process.exit(1);
  }
};
