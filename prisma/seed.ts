import { PrismaClient, Role, LessonType, Visibility, AccessRule } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Admin User ───
  const adminPassword = await argon2.hash('Admin123!');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@learnsphere.io' },
    update: {},
    create: {
      email: 'admin@learnsphere.io',
      passwordHash: adminPassword,
      name: 'Platform Admin',
      role: Role.ADMIN,
    },
  });
  console.log(`  ✓ Admin: ${admin.email}`);

  // ─── Instructor User ───
  const instructorPassword = await argon2.hash('Instructor123!');
  const instructor = await prisma.user.upsert({
    where: { email: 'instructor@learnsphere.io' },
    update: {},
    create: {
      email: 'instructor@learnsphere.io',
      passwordHash: instructorPassword,
      name: 'Jane Instructor',
      role: Role.INSTRUCTOR,
      bio: 'Senior TypeScript developer and educator.',
    },
  });
  console.log(`  ✓ Instructor: ${instructor.email}`);

  // ─── Learner User ───
  const learnerPassword = await argon2.hash('Learner123!');
  const learner = await prisma.user.upsert({
    where: { email: 'learner@learnsphere.io' },
    update: {},
    create: {
      email: 'learner@learnsphere.io',
      passwordHash: learnerPassword,
      name: 'Bob Learner',
      role: Role.LEARNER,
    },
  });
  console.log(`  ✓ Learner: ${learner.email}`);

  // ─── Sample Cover Image ───
  // Create a simple 1px image placeholder (base64 encoded PNG)
  const imagePlaceholder = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  const coverImage = await prisma.file.upsert({
    where: { id: 'seed-cover-image' },
    update: {},
    create: {
      id: 'seed-cover-image',
      filename: 'typescript-course-cover.png',
      mimeType: 'image/png',
      size: imagePlaceholder.length,
      url: '/api/v1/uploads/seed-cover-image',
      data: imagePlaceholder,
      uploadedById: instructor.id,
    },
  });
  console.log(`  ✓ Cover Image: ${coverImage.filename}`);

  // ─── Sample Course ───
  const course = await prisma.course.upsert({
    where: { slug: 'intro-to-typescript' },
    update: {},
    create: {
      title: 'Introduction to TypeScript',
      slug: 'intro-to-typescript',
      description:
        'Learn TypeScript from scratch — types, interfaces, generics, and real-world patterns.',
      tags: ['typescript', 'javascript', 'programming'],
      published: true,
      websiteUrl: 'https://learnsphere.io/courses/intro-to-typescript',
      visibility: Visibility.EVERYONE,
      accessRule: AccessRule.OPEN,
      responsibleId: instructor.id,
      coverImageId: coverImage.id,
    },
  });
  console.log(`  ✓ Course: ${course.title}`);

  // ─── Lessons ───
  const lesson1 = await prisma.lesson.upsert({
    where: { unique_lesson_order_per_course: { courseId: course.id, sortOrder: 0 } },
    update: {},
    create: {
      courseId: course.id,
      title: 'What is TypeScript?',
      type: LessonType.VIDEO,
      externalUrl: 'https://www.youtube.com/watch?v=example1',
      durationSec: 600,
      sortOrder: 0,
      description: 'An overview of TypeScript and why it matters.',
    },
  });

  const lesson2 = await prisma.lesson.upsert({
    where: { unique_lesson_order_per_course: { courseId: course.id, sortOrder: 1 } },
    update: {},
    create: {
      courseId: course.id,
      title: 'Setting Up Your Environment',
      type: LessonType.DOCUMENT,
      durationSec: 300,
      sortOrder: 1,
      description: 'Install Node.js, VS Code, and configure a TypeScript project.',
    },
  });

  await prisma.course.update({
    where: { id: course.id },
    data: { lessonsCount: 2, totalDurationSec: 900 },
  });
  console.log(`  ✓ Lessons: ${lesson1.title}, ${lesson2.title}`);

  // ─── Quiz ───
  const quiz = await prisma.quiz.upsert({
    where: { id: 'seed-quiz-1' },
    update: {},
    create: {
      id: 'seed-quiz-1',
      courseId: course.id,
      title: 'TypeScript Basics Quiz',
      description: 'Test your knowledge of TypeScript fundamentals.',
      pointsFirstTry: 100,
      pointsSecondTry: 75,
      pointsThirdTry: 50,
      pointsFourthPlus: 25,
      questions: {
        create: [
          {
            text: 'What is the file extension for TypeScript files?',
            options: {
              create: [
                { text: '.js', isCorrect: false },
                { text: '.ts', isCorrect: true },
                { text: '.jsx', isCorrect: false },
                { text: '.py', isCorrect: false },
              ],
            },
          },
          {
            text: 'Which keyword is used to define a type alias in TypeScript?',
            options: {
              create: [
                { text: 'type', isCorrect: true },
                { text: 'typedef', isCorrect: false },
                { text: 'alias', isCorrect: false },
                { text: 'define', isCorrect: false },
              ],
            },
          },
          {
            text: 'TypeScript is a superset of which language?',
            options: {
              create: [
                { text: 'Java', isCorrect: false },
                { text: 'Python', isCorrect: false },
                { text: 'JavaScript', isCorrect: true },
                { text: 'C#', isCorrect: false },
              ],
            },
          },
        ],
      },
    },
  });
  console.log(`  ✓ Quiz: ${quiz.title} (3 questions)`);

  // ─── Badges ───
  const badges = [
    { name: 'Newbie', description: 'Earned 20 points', requiredPoints: 20, iconUrl: '🌱' },
    { name: 'Explorer', description: 'Earned 40 points', requiredPoints: 40, iconUrl: '🧭' },
    { name: 'Achiever', description: 'Earned 60 points', requiredPoints: 60, iconUrl: '⭐' },
    { name: 'Specialist', description: 'Earned 80 points', requiredPoints: 80, iconUrl: '🔬' },
    { name: 'Expert', description: 'Earned 100 points', requiredPoints: 100, iconUrl: '🏅' },
    { name: 'Master', description: 'Earned 120 points', requiredPoints: 120, iconUrl: '👑' },
  ];

  for (const b of badges) {
    await prisma.badge.upsert({
      where: { id: b.name.toLowerCase().replace(/\s/g, '-') },
      update: {},
      create: {
        id: b.name.toLowerCase().replace(/\s/g, '-'),
        ...b,
      },
    });
  }
  console.log(`  ✓ Badges: ${badges.map((b) => b.name).join(', ')}`);

  console.log('\n✅ Seed complete!');
  console.log('\nTest credentials:');
  console.log('  Admin:      admin@learnsphere.io / Admin123!');
  console.log('  Instructor: instructor@learnsphere.io / Instructor123!');
  console.log('  Learner:    learner@learnsphere.io / Learner123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
