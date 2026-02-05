import { Injectable } from '@nestjs/common';
import * as crc from 'crc';

@Injectable()
export class EmvcoService {
  /**
   * Genera el string EMVCo basado en el payload de la transacción
   * @param data Objeto con los datos de la transacción
   */
  generatePaymentQR(data: {
    id: string;
    ref: string;
    no: number;
    tenantName: string;
    amount: number;
    expiresAt: string;
    mcc?: string; // Opcional, por defecto 5311
  }): string {
    const tags = new Map<string, string>();

    // --- SECCIÓN 1: Identificadores Básicos ---
    tags.set('00', '01'); // Payload Format Indicator
    tags.set('01', '12'); // Point of Initiation Method (12 = Dinámico)

    // --- SECCIÓN 2: Información del Comercio ---
    // Tag 15: Merchant Account Info (Usamos el nombre del comercio)
    const merchantName = data.tenantName.substring(0, 25); 
    tags.set('15', merchantName);

    // Tag 52: Merchant Category Code (MCC)
    // 5311 es el estándar para eCommerce / Tiendas departamentales
    const mcc = data.mcc || '5311';
    tags.set('52', mcc.padStart(4, '0'));

    // --- SECCIÓN 3: Moneda y Monto ---
    tags.set('53', '840'); // ISO 4217: 840=USD (Siempre USD por el momento)
    tags.set('54', data.amount.toString());

    // --- SECCIÓN 4: Datos Adicionales (Tus campos personalizados) ---
    // Usamos el Tag 62 (Additional Data Context) que permite sub-tags
    const subTags = 
      this.formatTag('01', data.ref) +                // Bill Number / Ref
      this.formatTag('05', data.id) +                 // Transaction ID (UUID)
      this.formatTag('07', data.no.toString()) +      // Terminal ID / Consecutivo
      this.formatTag('09', data.expiresAt);           // Expiración personalizada
    
    tags.set('62', subTags);

    // --- SECCIÓN 5: Construcción y Checksum ---
    let emvString = '';
    // Los tags deben ir en orden numérico ascendente según EMVCo
    const sortedTags = Array.from(tags.keys()).sort();
    
    for (const tag of sortedTags) {
      emvString += this.formatTag(tag, tags.get(tag) || '');
    }

    // El Tag 63 indica el inicio del CRC y siempre mide 04 caracteres
    emvString += '6304';

    // Cálculo del CRC16 CCITT (False)
    const checksum = crc.crc16ccitt(emvString).toString(16).toUpperCase().padStart(4, '0');
    
    return emvString + checksum;
  }

  /**
   * Helper para formatear en TLV (Tag-Length-Value)
   */
  private formatTag(tag: string, value: string): string {
    if (!value) return '';
    const len = value.length.toString().padStart(2, '0');
    return `${tag}${len}${value}`;
  }
}