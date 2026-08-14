import type { UserRole } from '@event-platform/contracts';
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'required_roles';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
