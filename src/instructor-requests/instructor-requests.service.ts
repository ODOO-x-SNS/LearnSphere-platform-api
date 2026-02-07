import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstructorRequestsService {
  private readonly logger = new Logger(InstructorRequestsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** List all pending instructor signups */
  async findAll() {
    return this.prisma.user.findMany({
      where: { role: 'INSTRUCTOR', status: 'PENDING' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Approve an instructor */
  async approve(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'INSTRUCTOR' || user.status !== 'PENDING') {
      throw new NotFoundException('Pending instructor request not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });

    this.logger.log(`Instructor approved: ${user.email}`);
    return { message: 'Instructor approved' };
  }

  /** Reject an instructor */
  async reject(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'INSTRUCTOR' || user.status !== 'PENDING') {
      throw new NotFoundException('Pending instructor request not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { status: 'REJECTED' },
    });

    this.logger.log(`Instructor rejected: ${user.email}`);
    return { message: 'Instructor rejected' };
  }
}
