import { z } from 'zod';

import { identifierSchema } from './workflow-contract';

/**
 * HTTP Basic credentials for the OPDS catalog. Both may be left empty, which means the catalog
 * requires no authentication at all — an explicit choice, not a fallback (ADR 0018).
 */
export const opdsAuthConfigSchema = z.object({
  username: z.string().trim().max(100),
  password: z.string().max(200),
});

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
}
