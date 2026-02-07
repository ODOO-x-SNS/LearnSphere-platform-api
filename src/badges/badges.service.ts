import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Check & award eligible badges for a user */
  async checkAndAwardBadges(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totalPoints: true },
    });
    if (!user) return;

    const badges = await this.prisma.badge.findMany({
      where: { requiredPoints: { lte: user.totalPoints } },
    });

    const existingBadges = await this.prisma.userBadge.findMany({
      where: { userId },
      select: { badgeId: true },
    });
    const existingIds = new Set(existingBadges.map((b) => b.badgeId));

    const newBadges = badges.filter((b) => !existingIds.has(b.id));
    if (newBadges.length === 0) return [];

    const created = await this.prisma.userBadge.createMany({
      data: newBadges.map((b) => ({ userId, badgeId: b.id })),
      skipDuplicates: true,
    });

    return { awarded: created.count, badges: newBadges.map((b) => b.name) };
  }

  /** Get user's badges */
  async getUserBadges(userId: string) {
    return this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    });
  }

  /** List all possible badges */
  async findAll() {
    return this.prisma.badge.findMany({ orderBy: { requiredPoints: 'asc' } });
  }
}
