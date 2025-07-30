import { Request, Response } from 'express';
import User from '../models/user.model';
import { validationResult } from 'express-validator';
import { signTokens, verifyToken } from '../utils/jwt';


export const register = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { username, email, password, role } = req.body;
  const existing = await User.findOne({ $or: [{ username }, { email }] });
  if (existing) {
    return res.status(409).json({ message: 'User already exists' });
  }
  const payload: any ={
    username,email,password_hash:password,
  };
  if (role) {
    payload.role=role;
  
  }
  const user = await User.create(payload)
  const tokens = signTokens(user);
  res.status(201).json(tokens);
};

export const login = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { usernameOrEmail, password } = req.body;
  const user = await User.findOne({
    $or: [
      { username: usernameOrEmail.toLowerCase() },
      { email: usernameOrEmail.toLowerCase() }
    ]
  });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const ok = await user.comparePassword(password);
  if (!ok) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const tokens = signTokens(user);
  res.json(tokens);
};

export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'No refresh token provided' });
  }
  try {
    const payload = verifyToken<{ sub: string }>(refreshToken);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    const tokens = signTokens(user);
    res.json(tokens);
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

export const me = async (req: Request, res: Response) => {
  res.json(req.user);
};

  export const listUsers = async (_req: Request, res: Response) => {
  const users = await User.find({}, {
    password_hash: 0,    
    __v: 0               
  }).sort({ createdAt: -1 });
  res.json(users);
};

export const resetPasswordByEmailOrUsername = async (req: Request, res: Response) => {
  const { emailOrUsername, newPassword } = req.body;

  if (typeof emailOrUsername !== 'string' || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ message: 'Invalid emailOrUsername or newPassword too short' });
  }
    const user = await User.findOne({
    $or: [
      { email: emailOrUsername.toLowerCase() },
      { username: emailOrUsername.toLowerCase() }
    ]
  });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  user.password_hash = newPassword;
  await user.save();

  res.status(204).send();
};
