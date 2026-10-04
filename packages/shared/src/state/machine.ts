/**
 * Minimal explicit state machine helper. Anything with a lifecycle declares its
 * allowed transitions here; everything not listed is rejected.
 */
export type TransitionTable<S extends string> = Readonly<Record<S, readonly S[]>>;

export class InvalidTransitionError<S extends string> extends Error {
  constructor(
    public readonly entity: string,
    public readonly from: S,
    public readonly to: S,
  ) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function createMachine<S extends string>(entity: string, table: TransitionTable<S>) {
  return {
    entity,
    table,
    canTransition(from: S, to: S): boolean {
      return table[from].includes(to);
    },
    assertTransition(from: S, to: S): void {
      if (!table[from].includes(to)) throw new InvalidTransitionError(entity, from, to);
    },
    isTerminal(state: S): boolean {
      return table[state].length === 0;
    },
  };
}
