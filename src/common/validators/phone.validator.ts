import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isValidPhone', async: false })
export class IsValidPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // Validar que sea exactamente 8 dígitos
    if (!/^\d{8}$/.test(value)) {
      return false;
    }

    // Validar que inicie con 5 o 6
    const firstDigit = value.charAt(0);
    return firstDigit === '5' || firstDigit === '6';
  }

  defaultMessage(): string {
    return 'El teléfono debe comenzar con 5 o 6 y tener exactamente 8 dígitos';
  }
}

export function IsPhone(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidPhoneConstraint,
    });
  };
}
