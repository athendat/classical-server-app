export enum TerminalType {
  PHYSICAL_POS = 'physical_pos',
  WEB = 'web',
  KIOSK = 'kiosk',
}

export enum TerminalCapability {
  NFC = 'nfc',
  MAGNETIC_STRIPE = 'magnetic_stripe',
  CHIP = 'chip',
  QR_SCAN = 'qr_scan',
  QR_DISPLAY = 'qr_display',
  MANUAL_ENTRY = 'manual_entry',
}

export enum TerminalStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
}

// Type-based scope templates
export const TERMINAL_SCOPE_TEMPLATES: Record<TerminalType, string[]> = {
  [TerminalType.PHYSICAL_POS]: ['payments:authorize', 'payments:refund', 'transactions:read'],
  [TerminalType.WEB]: ['payments:authorize', 'transactions:read'],
  [TerminalType.KIOSK]: ['payments:authorize'],
};

export const TERMINAL_INJECTION_TOKENS = {
  TERMINAL_REPOSITORY: Symbol('ITerminalRepository'),
};
