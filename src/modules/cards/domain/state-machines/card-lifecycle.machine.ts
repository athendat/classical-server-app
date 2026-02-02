import { createMachine } from 'xstate';
import { CardStatusEnum } from '../enums/card-status.enum';

/**
 * XState machine definition for card lifecycle
 * States: ACTIVE, BLOCKED
 * Transitions: ACTIVE ↔ BLOCKED
 */
export const cardLifecycleMachine = createMachine({
  id: 'cardLifecycle',
  initial: CardStatusEnum.ACTIVE,
  states: {
    [CardStatusEnum.ACTIVE]: {
      on: {
        BLOCK: CardStatusEnum.BLOCKED,
      },
    },
    [CardStatusEnum.BLOCKED]: {
      on: {
        UNBLOCK: CardStatusEnum.ACTIVE,
      },
    },
  },
});
