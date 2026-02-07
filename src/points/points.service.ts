import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PointsService {
  private readonly logger = new Logger(PointsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Get user's points transactions */
  async getUserPoints(userId: string) {
    const transactions = await this.prisma.pointsTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const total = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totalPoints: true },
    });

    return { totalPoints: total?.totalPoints ?? 0, transactions };
  }

  /** Manually award points (admin) */
  async awardPoints(userId: string, points: number, note: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.pointsTransaction.create({
        data: {
          userId,
          source: 'MANUAL',
          points,
          metadata: { note, awardedBy: actorId },
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { totalPoints: { increment: points } },
      });

      return transaction;
    });
  }
}
