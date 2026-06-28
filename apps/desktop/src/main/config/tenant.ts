// Desktop (main process) view of the active tenant config. Same JSON the web
// app reads, swapped per association at deploy time (see tools/use-tenant.mjs).
import tenantJson from '@sagra/shared/config/tenant.json';
import type { TenantConfig } from '@sagra/shared/config/types';

export const tenant = tenantJson as TenantConfig;
