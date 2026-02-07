import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Decorator to restrict endpoint access to specific roles.
 * Usage: @Roles(Role.ADMIN, Role.INSTRUCTOR)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
