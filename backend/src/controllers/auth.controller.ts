import { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { validationResult } from 'express-validator';
import User from '../models/user.model';
import { signTokens, verifyToken } from '../utils/jwt';

/**
 * POST /register
 */
export const register = async (req: Request, res: Response) => {
  // Helpful while you test; remove later if you want
  // console.log('REGISTER body:', JSON.stringify(req.body));

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Accept top-level storenumber (and also tolerate nested/typo if sent)
  const b: any = req.body || {};
  const rawStoreNumber =
    b.storenumber ??
    b.store?.storenumber ??
    b.storenymber ?? // safety for old typo
    b.store?.storenymber;

  const storenumber = Number(rawStoreNumber);
  if (!Number.isFinite(storenumber)) {
    return res.status(400).json({ message: 'storenumber is required and must be a number' });
  }

  const {
    username,
    email,
    password,
    role,
    storename = b.storename ?? b.store?.storename,
    manager = b.manager ?? b.store?.manager,
    location = b.location ?? b.store?.location,
    address = b.address ?? b.store?.address,
    deliveryaddress = b.deliveryaddress ?? b.store?.deliveryaddress,
    contact = b.contact ?? b.store?.contact,
    companycontact = b.companycontact ?? b.store?.companycontact,
    vat = b.vat ?? b.store?.vat,
  } = b;

  const existing = await User.findOne({
    $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }],
  });
  if (existing) {
    return res.status(409).json({ message: 'User already exists' });
  }

  const payload: any = {
    username,
    email,
    password_hash: password, // pre('save') will hash this
    storenumber,
    storename,
    manager,
    location,
    address,
    deliveryaddress,
    contact,
    companycontact,
    vat,
  };
  if (role) payload.role = role;

  try {
    const user = await User.create(payload);
    const tokens = signTokens(user);
    res.status(201).json(tokens);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Username or email already exists' });
    }
    return res.status(400).json({ message: err?.message || 'Failed to register' });
  }
};

/**
 * POST /login
 */
export const login = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { usernameOrEmail, password } = req.body;

  const user = await User.findOne({
    $or: [
      { username: usernameOrEmail.toLowerCase() },
      { email: usernameOrEmail.toLowerCase() },
    ],
  });

  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const ok = await user.comparePassword(password);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  const tokens = signTokens(user);
  res.json(tokens);
};

/**
 * POST /refresh
 */
export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'No refresh token provided' });
  }
  try {
    const payload = verifyToken<{ sub: string }>(refreshToken, 'refresh');
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    const tokens = signTokens(user);
    res.json(tokens);
  } catch {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

/**
 * GET /me
 */
export const me = async (req: Request, res: Response) => {
  res.json((req as any).user);
};

/**
 * GET /users
 */
export const listUsers = async (_req: Request, res: Response) => {
  const users = await User.find({}, { password_hash: 0, __v: 0 }).sort({ createdAt: -1 });
  res.json(users);
};

/**
 * GET /users/:id
 */
export const getUser = async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id).select('-password_hash -__v').lean();
  if (!user) return res.status(404).json({ message: 'Not found' });
  res.json(user);
};

/**
 * PATCH /users/:id
 * (admin can edit any user; can set new password via "password")
 */
export const updateUser = async (req: Request, res: Response) => {
  const allowed: string[] = [
    'username',
    'email',
    'role',
    'storenumber',
    'storename',
    'manager',
    'location',
    'address',
    'deliveryaddress',
    'contact',
    'companycontact',
    'vat',
    'password',
  ];

  const updates: any = {};
  for (const k of allowed) {
    if (k in req.body && req.body[k] !== undefined) updates[k] = req.body[k];
  }

  if (typeof updates.username === 'string') updates.username = updates.username.toLowerCase();
  if (typeof updates.email === 'string') updates.email = updates.email.toLowerCase();

  if (typeof updates.password === 'string' && updates.password.length >= 6) {
    updates.password_hash = await bcrypt.hash(updates.password, 12);
  }
  delete updates.password;

  try {
    const doc = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
      context: 'query',
      projection: { password_hash: 0, __v: 0 },
    });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.json(doc);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Username or email already in use' });
    }
    return res.status(400).json({ message: err?.message || 'Failed to update user' });
  }
};

/**
 * PATCH /users/password
 */
export const resetPasswordByEmailOrUsername = async (req: Request, res: Response) => {
  const { emailOrUsername, newPassword } = req.body;

  if (
    typeof emailOrUsername !== 'string' ||
    typeof newPassword !== 'string' ||
    newPassword.length < 6
  ) {
    return res.status(400).json({ message: 'Invalid emailOrUsername or newPassword too short' });
  }

  const user = await User.findOne({
    $or: [
      { email: emailOrUsername.toLowerCase() },
      { username: emailOrUsername.toLowerCase() },
    ],
  });
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.password_hash = newPassword; // pre('save') will hash
  await user.save();
  res.status(204).send();
};

/**
 * DELETE /users/:id
 */
export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid user id' });

  const result = await User.deleteOne({ _id: id });
  if (result.deletedCount === 0) return res.status(404).json({ message: 'Not found' });

  return res.status(200).json({ deleted: true, deletedCount: result.deletedCount });
};
