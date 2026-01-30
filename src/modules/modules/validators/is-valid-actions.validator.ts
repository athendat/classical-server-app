import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

/**
 * Validador custom @IsValidActions()
 * Valida que:
 * - Todos los elementos sean strings
 * - No haya duplicados
 * - No haya valores vacíos
 * - Se normalice a lowercase
 */
@ValidatorConstraint({ name: 'isValidActions', async: false })
export class IsValidActionsConstraint implements ValidatorConstraintInterface {
  validate(actions: any): boolean {
    // Validar que sea array
    if (!Array.isArray(actions)) {
      return false;
    }

    // Validar que no esté vacío
    if (actions.length === 0) {
      return false;
    }

    // Validar que todos sean strings y no estén vacíos
    const normalizedActions = new Set<string>();

    for (const action of actions) {
      if (typeof action !== 'string' || action.trim().length === 0) {
        return false;
      }

      const normalized = action.toLowerCase().trim();

      // Validar que sea alfanumérico con guiones permitidos
      if (!/^[a-z0-9_-]+$/.test(normalized)) {
        return false;
      }

      // Validar que no haya duplicados (case-insensitive)
      if (normalizedActions.has(normalized)) {
        return false;
      }

      normalizedActions.add(normalized);
    }

    return true;
  }

  defaultMessage(): string {
    return 'Las acciones deben ser un array de strings únicos, sin duplicados, en formato lowercase alfanumérico con guiones permitidos';
  }
}

/**
 * Decorador @IsValidActions()
 * Valida y normaliza acciones
 */
export function IsValidActions(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidActionsConstraint,
    });
  };
}
