/**
 * Domain Port: NfcEnrollmentRepository
 *
 * Contrato para persistencia de enrollments NFC.
 */

export interface NfcEnrollmentEntity {
  id: string;
  cardId: string;
  userId: string;
  devicePublicKey: string;
  serverPublicKey: string;
  vaultKeyPath: string;
  counter: number;
  status: string;
  revokedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface INfcEnrollmentRepository {
  findByCardId(cardId: string): Promise<NfcEnrollmentEntity | null>;
  create(enrollment: Partial<NfcEnrollmentEntity>): Promise<NfcEnrollmentEntity>;
  update(cardId: string, data: Partial<NfcEnrollmentEntity>): Promise<NfcEnrollmentEntity | null>;
  incrementCounter(cardId: string): Promise<number>;
}
