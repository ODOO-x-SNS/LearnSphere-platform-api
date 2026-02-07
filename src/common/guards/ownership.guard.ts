import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Generic ownership guard factory.
 * Checks that the current user owns the resource or is ADMIN.
 *
 * Usage in a controller:
 *   @UseGuards(new OwnershipGuard('course', 'id'))
 *
 * resourceType: Prisma model name (lowercase) – 'course', 'lesson', 'quiz'
 * paramName: route param containing the resource id (default 'id')
 * ownerField: field in the DB row that stores the owner userId (default 'responsibleId' for course, 'userId' otherwise)
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly resourceType: string,
    private readonly paramName: string = 'id',
    private readonly ownerField?: string,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    // Admins bypass ownership checks
    if (user.role === Role.ADMIN) return true;

    const resourceId = request.params[this.paramName];
    if (!resourceId) return false;

    const prisma: PrismaService = request.app?.get?.(PrismaService);
    if (!prisma) return false;

    const field = this.ownerField ?? (this.resourceType === 'course' ? 'responsibleId' : 'userId');
    const model = (prisma as any)[this.resourceType];
    if (!model) return false;

    const resource = await model.findUnique({ where: { id: resourceId }, select: { [field]: true } });
    if (!resource) return false;

    if (resource[field] !== user.sub) {
      throw new ForbiddenException('You do not own this resource');
    }
    return true;
  }
}
