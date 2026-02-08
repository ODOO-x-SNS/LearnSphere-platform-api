const { PrismaClient } = require('./node_modules/.prisma/client');
const p = new PrismaClient();

async function main() {
  // Fix: clear quizId from soft-deleted lessons
  const result = await p.lesson.updateMany({
    where: { deletedAt: { not: null }, quizId: { not: null } },
    data: { quizId: null },
  });
  console.log('Fixed', result.count, 'soft-deleted lessons');
}

main().catch(console.error).finally(() => p.$disconnect());
