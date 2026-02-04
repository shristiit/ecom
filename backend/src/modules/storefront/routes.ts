import { Router } from 'express';
import * as ctrl from './service.js';
import * as auth from './auth.js';
import { customerAuthGuard, requireCustomerRole } from '../../middlewares/customerAuth.js';

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

r.post('/carts', ctrl.createCart);
r.get('/carts', ctrl.listCarts);
r.post('/carts/:id/items', ctrl.addCartItem);
r.patch('/carts/:id/items/:itemId', ctrl.updateCartItem);
r.delete('/carts/:id/items/:itemId', ctrl.deleteCartItem);
r.post('/carts/:id/save-for-later', ctrl.saveForLater);

r.get('/saved', ctrl.savedItems);
r.post('/saved', ctrl.addSaved);
r.delete('/saved/:id', ctrl.deleteSaved);

r.get('/addresses', ctrl.listAddresses);
r.post('/addresses', ctrl.createAddress);
r.delete('/addresses/:id', ctrl.deleteAddress);

r.post('/orders', ctrl.createOrder);
r.get('/orders', ctrl.listOrders);
r.get('/orders/:id', ctrl.getOrder);

r.post('/orders/staff', requireCustomerRole(['staff','owner']), ctrl.createOrderAsStaff);

export default r;
