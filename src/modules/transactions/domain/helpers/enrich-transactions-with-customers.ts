import { Transaction } from '../entities/transaction.entity';

/** Estructura mínima del cliente que necesita el enriquecimiento. */
export interface CustomerLookup {
  id: string;
  fullname?: string;
}

/**
 * Embebe `customerName` en cada transacción a partir del listado de clientes
 * que ya viene en `meta.customers` del repositorio.
 *
 * Se aísla como función pura para poder probarla sin Mongo y para que el
 * frontend deje de necesitar hacer un cruce manual con `meta`.
 *
 * Cubre issue #28.
 */
export function enrichTransactionsWithCustomers(
  transactions: Transaction[],
  customers: CustomerLookup[],
): Transaction[] {
  if (transactions.length === 0) {
    return [];
  }

  const byId = new Map<string, CustomerLookup>(
    customers.map((c) => [c.id, c]),
  );

  return transactions.map((tx) => {
    const match = byId.get(tx.customerId);
    if (!match || !match.fullname) {
      return tx;
    }

    // Devolver una nueva instancia para mantener la función sin efectos
    // laterales (el constructor de Transaction copia campos via partial).
    return new Transaction({ ...tx, customerName: match.fullname });
  });
}
