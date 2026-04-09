import { z } from 'zod';

export const interpretSchema = z.object({
  text: z.string().min(1),
  conversationId: z.string().uuid().optional(),
});

export const navigateSchema = z.object({
  text: z.string().min(1),
  conversationId: z.string().uuid().optional(),
});

export const confirmSchema = z.object({
  transactionSpecId: z.string().uuid(),
  confirm: z.boolean(),
});

export const approveSchema = z.object({
  approvalId: z.string().uuid(),
  approve: z.boolean(),
});

export const executeSchema = z.object({
  transactionSpecId: z.string().uuid(),
});

export const respondSchema = z.object({
  text: z.string().min(1),
  conversationId: z.string().uuid().optional(),
});
