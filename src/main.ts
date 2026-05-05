import { createRootCommand } from "./commands/root.js";
import { printError } from "./errors.js";
import { closeUserDataPool } from "./storage/pool.js";

async function main(): Promise<void> {
  const program = createRootCommand();
  try {
    await program.parseAsync(process.argv);
  } finally {
    // pg Pool 은 idle 커넥션을 유지하며 event loop 를 잡고 있어서
    // 여기서 명시적으로 닫아야 `node dist/main.js` 가 자연스럽게 종료된다.
    // lazy pool 이라 한 번도 쓰이지 않았으면 no-op.
    await closeUserDataPool();
  }
}

main().catch(async (error) => {
  try {
    await closeUserDataPool();
  } catch {
    // 원본 에러 보고가 우선. pool 종료 실패는 로그만 남기지 않고 삼킨다.
  }
  printError(error);
});
