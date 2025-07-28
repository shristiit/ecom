// src/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';


//  Configuration

dotenv.config();
const app  = express();
const PORT = process.env.PORT || 4000;

//  Global Middleware

app.use(cors());
app.use(express.json());


//  Health check / root route

app.get('/', (req, res) => {
  res.send('API is running...');
});


const startServer = async () => {
  await connectDB();
  app.listen(PORT, () =>
    console.log(` Server listening on http://localhost:${PORT}`)
  );
};

startServer();
