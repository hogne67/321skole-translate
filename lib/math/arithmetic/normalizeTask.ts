import type { ArithmeticTask } from "./types";

export function normalizeArithmeticTask(task: ArithmeticTask): ArithmeticTask {
  if (task.unknownPosition) return task;

  // Older Spaces snapshots may contain the blank without its position metadata.
  const operands = task.prompt.match(
    /^\s*(□|-?\d+(?:[.,]\d+)?)\s*[+\-×÷*/]\s*(□|-?\d+(?:[.,]\d+)?)\s*=/
  );
  if (!operands || (operands[1] === "□") === (operands[2] === "□")) {
    return task;
  }

  return {
    ...task,
    unknownPosition: operands[1] === "□" ? "left" : "right",
  };
}
