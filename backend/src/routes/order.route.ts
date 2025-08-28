

import { Router } from "express";
import { body, param } from "express-validator";
import {
  createOrder,
  listOrders,
  getOrderById,
  deleteOrderById,
  updateOrder
} from "../controllers/order.controller";

const router = Router();

// Create Order
router.post(
  "/create",
  [
    body("customer").isString().notEmpty(),
    body("products").isArray({ min: 1 }),
    body("products.*.name").isString().notEmpty(),
    body("products.*.price").isFloat({ min: 0 }),
    body("products.*.quantity").isInt({ min: 1 }),
    body("totalAmount").isFloat({ min: 0 }),
    body("shippingAddress").optional().isString(),
  ],
  createOrder
);
// update Order 
router.post(
  "/update",
  [
    body("orderNumber").isString().notEmpty(),
    body("status").isString().notEmpty(),
  ],
  updateOrder
);
// List Orders
router.get("/list", listOrders);

// Get Order by ID
router.get("/:id", [param("id").isString().notEmpty()], getOrderById);

// Delete Order
router.delete("/:id", [param("id").isString().notEmpty()], deleteOrderById);

export default router;

