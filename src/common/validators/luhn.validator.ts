import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Implementa el algoritmo Luhn para validación de números de tarjetas
 * https://en.wikipedia.org/wiki/Luhn_algorithm
 */
@ValidatorConstraint({ name: 'isValidLuhn', async: false })
export class IsValidLuhnConstraint implements ValidatorConstraintInterface {
  /**
   * Valida un número usando el algoritmo Luhn
   * @param value - Cadena de caracteres (puede contener espacios o guiones)
   * @returns true si es válido, false en caso contrario
   */
  validate(value: any): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // Remover espacios, guiones y otros caracteres no numéricos
    const cleanValue = value.replace(/[\s-]/g, '');

    // Validar que solo contenga dígitos y tenga longitud válida (13-19 para tarjetas)
    if (!/^\d{13,19}$/.test(cleanValue)) {
      return false;
    }

    // Aplicar algoritmo Luhn
    let sum = 0;
    let isEven = false;

    // Procesar de derecha a izquierda
    for (let i = cleanValue.length - 1; i >= 0; i--) {
      let digit = parseInt(cleanValue.charAt(i), 10);

      if (isEven) {
        digit *= 2;
        // Si el resultado es mayor a 9, restar 9
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    // Válido si la suma es múltiplo de 10
    return sum % 10 === 0;
  }

  /**
   * Mensaje de error personalizado
   */
  defaultMessage(): string {
    return 'El número de tarjeta no es válido (falló validación Luhn)';
  }
}

/**
 * Decorador para validación de números de tarjeta con algoritmo Luhn
 * Uso en DTOs:
 * @IsLuhnCard()
 * cardNumber: string;
 */
export function IsLuhnCard(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidLuhnConstraint,
    });
  };
}
