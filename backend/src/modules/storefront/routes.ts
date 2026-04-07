import { Router } from 'express';
import * as ctrl from '@backend/modules/storefront/service.js';
import * as auth from '@backend/modules/storefront/auth.js';
import { customerAuthGuard, requireCustomerRole } from '@backend/middlewares/customerAuth.js';
import { idempotencyGuard } from '@backend/middlewares/idempotency.js';

const r = Router();

r.post('/auth/register', auth.register);
r.post('/auth/login', auth.login);
r.post('/auth/sso/auth0/exchange', auth.auth0Exchange);

r.get('/categories', ctrl.categories);
r.get('/products', ctrl.products);
r.get('/products/:id', ctrl.productDetail);
r.get('/search', ctrl.search);
 r.get('/promotions/available', ctrl.availablePromotions);
 r.post('/promotions/apply', ctrl.applyPromotion);

r.use(customerAuthGuard);
const idem = idempotencyGuard((req) => req.customer?.tenantId ?? null);

r.post('/carts', idem, ctrl.createCart);
r.get('/carts', ctrl.listCarts);
r.post('/carts/:id/items', idem, ctrl.addCartItem);
r.patch('/carts/:id/items/:itemId', idem, ctrl.updateCartItem);
r.delete('/carts/:id/items/:itemId', idem, ctrl.deleteCartItem);
r.post('/carts/:id/save-for-later', idem, ctrl.saveForLater);

r.get('/saved', ctrl.savedItems);
r.post('/saved', idem, ctrl.addSaved);
r.delete('/saved/:id', idem, ctrl.deleteSaved);

r.get('/addresses', ctrl.listAddresses);
r.post('/addresses', idem, ctrl.createAddress);
r.delete('/addresses/:id', idem, ctrl.deleteAddress);

r.post('/orders', idem, ctrl.createOrder);
r.get('/orders', ctrl.listOrders);
r.get('/orders/:id', ctrl.getOrder);

r.post('/orders/staff', requireCustomerRole(['staff','owner']), idem, ctrl.createOrderAsStaff);

export default r;
