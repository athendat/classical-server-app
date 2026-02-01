import { createMachine } from 'xstate';
import { TenantStatus } from './enums';

/**
 * Máquina de estados para el ciclo de vida de un Tenant
 * Define los estados posibles y las transiciones válidas
 *
 * Estados:
 * - pending_review: Inicial, en espera de revisión
 * - more_data_requested: Se solicitaron más datos
 * - approved: Aprobado pero no completamente activo
 * - rejected: Rechazado (terminal)
 * - active: Completamente activo y operativo
 *
 * Transiciones permitidas:
 * - pending_review → {more_data_requested, approved, rejected}
 * - more_data_requested → {approved, rejected, active}
 * - approved → active
 * - rejected → (terminal, sin transiciones)
 * - active → (terminal de operación normal)
 */
export const tenantStateMachine = createMachine(
  {
    id: 'tenant-lifecycle',
    initial: TenantStatus.PENDING_REVIEW,
    states: {
      [TenantStatus.PENDING_REVIEW]: {
        on: {
          APPROVE: {
            target: TenantStatus.APPROVED,
          },
          REQUEST_MORE_DATA: {
            target: TenantStatus.MORE_DATA_REQUESTED,
          },
          REJECT: {
            target: TenantStatus.REJECTED,
          },
        },
      },

      [TenantStatus.MORE_DATA_REQUESTED]: {
        on: {
          APPROVE: {
            target: TenantStatus.APPROVED,
          },
          ACTIVATE: {
            target: TenantStatus.ACTIVE,
          },
          REJECT: {
            target: TenantStatus.REJECTED,
          },
        },
      },

      [TenantStatus.APPROVED]: {
        on: {
          ACTIVATE: {
            target: TenantStatus.ACTIVE,
          },
        },
      },

      [TenantStatus.REJECTED]: {
        type: 'final',
      },

      [TenantStatus.ACTIVE]: {
        type: 'final',
      },
    },
  },
  {},
);

/**
 * Valida si una transición de estado es válida según la máquina de estados
 * @param fromState - Estado actual
 * @param toState - Estado destino deseado
 * @returns true si la transición es válida, false en caso contrario
 */
export function isValidStateTransition(
  fromState: TenantStatus,
  toState: TenantStatus,
): boolean {
  // Si es el mismo estado, no es una transición
  if (fromState === toState) {
    return false;
  }

  // Definir transiciones válidas explícitamente
  const validTransitions: Record<TenantStatus, TenantStatus[]> = {
    [TenantStatus.PENDING_REVIEW]: [
      TenantStatus.APPROVED,
      TenantStatus.MORE_DATA_REQUESTED,
      TenantStatus.REJECTED,
    ],
    [TenantStatus.MORE_DATA_REQUESTED]: [
      TenantStatus.APPROVED,
      TenantStatus.ACTIVE,
      TenantStatus.REJECTED,
    ],
    [TenantStatus.APPROVED]: [TenantStatus.ACTIVE],
    [TenantStatus.REJECTED]: [], // Terminal, sin transiciones
    [TenantStatus.ACTIVE]: [], // Terminal de operación, sin cambios de estado
  };

  const allowedTargets = validTransitions[fromState] || [];
  return allowedTargets.includes(toState);
}

/**
 * Obtiene el evento xstate necesario para transicionar a un estado destino
 * @param fromState - Estado actual
 * @param toState - Estado destino
 * @returns Nombre del evento para la máquina de estados
 */
export function getTransitionEvent(
  fromState: TenantStatus,
  toState: TenantStatus,
): string {
  const eventMap: Record<string, Record<string, string>> = {
    [TenantStatus.PENDING_REVIEW]: {
      [TenantStatus.APPROVED]: 'APPROVE',
      [TenantStatus.MORE_DATA_REQUESTED]: 'REQUEST_MORE_DATA',
      [TenantStatus.REJECTED]: 'REJECT',
    },
    [TenantStatus.MORE_DATA_REQUESTED]: {
      [TenantStatus.APPROVED]: 'APPROVE',
      [TenantStatus.ACTIVE]: 'ACTIVATE',
      [TenantStatus.REJECTED]: 'REJECT',
    },
    [TenantStatus.APPROVED]: {
      [TenantStatus.ACTIVE]: 'ACTIVATE',
    },
  };

  return eventMap[fromState]?.[toState] || '';
}
