import type { ValidationError } from 'class-validator';

const REQUIRED_CONSTRAINT = { isDefined: 'validation.REQUIRED' };

const TYPE_CONSTRAINTS = [
  'isString',
  'isInt',
  'isNumber',
  'isBoolean',
  'isArray',
] as const;

export function normalizeValidationErrors(
  errors: ValidationError[],
  parentPath?: string,
): ValidationError[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    const children = normalizeValidationErrors(error.children ?? [], path);

    if (!error.constraints) {
      return children;
    }

    return [
      {
        ...error,
        property: path,
        children: [],
        constraints: primaryConstraints(error),
      },
      ...children,
    ];
  });
}

function primaryConstraints(error: ValidationError): Record<string, string> {
  const constraints = error.constraints ?? {};

  if (error.value === undefined || error.value === null) {
    return REQUIRED_CONSTRAINT;
  }

  const typeConstraint = TYPE_CONSTRAINTS.find((key) => key in constraints);

  return typeConstraint
    ? { [typeConstraint]: constraints[typeConstraint] }
    : constraints;
}
