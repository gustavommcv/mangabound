import { z } from 'zod';

import { identifierSchema } from './workflow-contract';

export const opdsAuthConfigSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('token') }),
  z.object({
    mode: z.literal('basic'),
    username: z.string().trim().min(1).max(100),
    password: z.string().min(1).max(200),
  }),
]);

export const startSharingCommandSchema = z.object({
  libraryId: identifierSchema,
  interfaceAddress: z.string().min(1),
  auth: opdsAuthConfigSchema,
});

export type OpdsAuthConfig = z.infer<typeof opdsAuthConfigSchema>;

export interface NetworkInterfaceOption {
  readonly name: string;
  readonly address: string;
}

export interface OpdsSharingStatus {
  readonly active: boolean;
  readonly url?: string;
  readonly interfaceAddress?: string;
  readonly port?: number;
  readonly authMode?: 'token' | 'basic';
  readonly token?: string;
}
