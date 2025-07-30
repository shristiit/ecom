// src/middlewares/roleGuard.ts
import { Request, Response, NextFunction } from 'express';
/* 
roleGuard('admin') will reject everyone except admins to access
 */
export const roleGuard = (requiredRole: 'admin' | 'customer') => {
  return (req: Request, res: Response, next: NextFunction) => {
    // req.user is set by authGuard
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'No authenticated user' });
    }
    if (user.role !== requiredRole) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
};
