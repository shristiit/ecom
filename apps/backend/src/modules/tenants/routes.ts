import { Router } from 'express';
import * as ctrl from './service.js';

const r = Router();

r.post('/', ctrl.createTenant);
r.get('/:id', ctrl.getTenant);

export default r;
