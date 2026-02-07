import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

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

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const newHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return { message: 'Password updated successfully' };
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

  /** Admin: list all instructors with pagination */
  async listInstructors(skip: number = 0, take: number = 20) {
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'INSTRUCTOR', deletedAt: null },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          bio: true,
          totalPoints: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({
        where: { role: 'INSTRUCTOR', deletedAt: null },
      }),
    ]);

    return {
      data,
      paging: {
        total,
        skip,
        take,
        hasMore: skip + take < total,
      },
    };
  }

  /** Admin: get instructor details with course info */
  async getInstructorDetails(instructorId: string) {
    const instructor = await this.prisma.user.findUnique({
      where: { id: instructorId, role: 'INSTRUCTOR' },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        bio: true,
        totalPoints: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!instructor) throw new NotFoundException('Instructor not found');

    // Get courses authored by this instructor
    const courses = await this.prisma.course.findMany({
      where: { responsibleId: instructorId },
      select: {
        id: true,
        title: true,
        published: true,
        createdAt: true,
      },
    });

    // Get student count from enrollments in instructor's courses
    const enrollments = await this.prisma.enrollment.count({
      where: {
        course: { responsibleId: instructorId },
      },
    });

    return {
      ...instructor,
      coursesCount: courses.length,
      studentCount: enrollments,
      courses,
    };
  }
}
