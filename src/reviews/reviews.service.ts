import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(courseId: string, dto: CreateReviewDto, user: JwtPayload) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    // One review per user per course
    const existing = await this.prisma.review.findUnique({
      where: { one_review_per_user_per_course: { courseId, userId: user.sub } },
    });
    if (existing) throw new ConflictException('You have already reviewed this course');

    return this.prisma.review.create({
      data: {
        courseId,
        userId: user.sub,
        rating: dto.rating,
        text: dto.text,
      },
    });
  }

  async findByCourse(courseId: string) {
    return this.prisma.review.findMany({
      where: { courseId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
