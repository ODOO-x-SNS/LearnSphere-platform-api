import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        bio: true,
        totalPoints: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        bio: true,
        totalPoints: true,
      },
    });
  }

  /** GDPR: export all user data */
  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        enrollments: true,
        quizAttempts: true,
        reviews: true,
        points: true,
        badges: { include: { badge: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, refreshTokenHash, ...safe } = user;
    return safe;
  }

  /** GDPR: anonymize / soft-delete */
  async deleteAccount(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@anon.learnsphere.io`,
        name: null,
        avatarUrl: null,
        bio: null,
        passwordHash: 'DELETED',
        refreshTokenHash: null,
        deletedAt: new Date(),
      },
    });
    return { message: 'Account anonymized' };
  }
}
