import { Transaction } from '../entities/transaction.entity';
import { enrichTransactionsWithCustomers } from './enrich-transactions-with-customers';

/**
 * Issue #28 — el listado /transactions devolvía customer vacío en cada fila.
 * El repositorio ya cargaba los clientes en meta.customers; falta cruzarlos
 * y embeberlos en cada transacción para que el frontend tenga el dato.
 */
describe('enrichTransactionsWithCustomers', () => {
  const tx = (partial: Partial<Transaction>) =>
    new Transaction({ id: 'tx-1', customerId: 'user-a', ...partial });

  it('inyecta customerName cuando el customerId existe en el lookup', () => {
    const transactions = [tx({ id: 'tx-1', customerId: 'user-a' })];
    const customers = [{ id: 'user-a', fullname: 'Frank Rodríguez' }] as any;

    const result = enrichTransactionsWithCustomers(transactions, customers);

    expect(result).toHaveLength(1);
    expect(result[0].customerName).toBe('Frank Rodríguez');
  });

  it('deja customerName vacío cuando no hay coincidencia', () => {
    const transactions = [tx({ id: 'tx-2', customerId: 'user-x' })];
    const customers = [{ id: 'user-a', fullname: 'Frank Rodríguez' }] as any;

    const result = enrichTransactionsWithCustomers(transactions, customers);

    expect(result[0].customerName).toBeUndefined();
  });

  it('preserva todos los demás campos de la transacción', () => {
    const transactions = [
      tx({ id: 'tx-3', customerId: 'user-a', ref: 'ORD-9', amount: 1500 }),
    ];
    const customers = [{ id: 'user-a', fullname: 'Frank' }] as any;

    const result = enrichTransactionsWithCustomers(transactions, customers);

    expect(result[0].id).toBe('tx-3');
    expect(result[0].ref).toBe('ORD-9');
    expect(result[0].amount).toBe(1500);
  });

  it('admite lista de clientes vacía sin lanzar', () => {
    const transactions = [tx({ id: 'tx-4', customerId: 'user-a' })];

    const result = enrichTransactionsWithCustomers(transactions, []);

    expect(result[0].customerName).toBeUndefined();
  });

  it('admite lista de transacciones vacía', () => {
    const result = enrichTransactionsWithCustomers([], []);
    expect(result).toEqual([]);
  });

  it('no muta la transacción original (función pura)', () => {
    const original = tx({ id: 'tx-pure', customerId: 'user-a' });
    const customers = [{ id: 'user-a', fullname: 'Frank' }] as any;

    const [returned] = enrichTransactionsWithCustomers([original], customers);

    // Cada item es una nueva instancia con customerName poblado.
    expect(returned).not.toBe(original);
    expect(returned.customerName).toBe('Frank');
    // El input original sigue sin customerName.
    expect(original.customerName).toBeUndefined();
  });
});
