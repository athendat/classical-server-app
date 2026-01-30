import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isStrongPassword', async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // Mínimo 8 caracteres
    if (value.length < 8) {
      return false;
    }

    // Debe contener mayúscula
    if (!/[A-Z]/.test(value)) {
      return false;
    }

    // Debe contener minúscula
    if (!/[a-z]/.test(value)) {
      return false;
    }

    // Debe contener número
    if (!/\d/.test(value)) {
      return false;
    }

    // Debe contener símbolo especial (@$!%*?&)
    if (!/[@$!%*?&]/.test(value)) {
      return false;
    }

    return true;
  }

  defaultMessage(): string {
    return 'La contraseña debe tener mínimo 8 caracteres, incluir mayúscula, minúscula, número y símbolo (@$!%*?&)';
  }
}

export function IsPassword(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}
