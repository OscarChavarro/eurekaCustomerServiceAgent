import {
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments
} from 'class-validator';

@ValidatorConstraint({ name: 'atLeastOneDeleteContactField', async: false })
class AtLeastOneDeleteContactFieldConstraint implements ValidatorConstraintInterface {
  public validate(_value: unknown, validationArguments: ValidationArguments): boolean {
    const requestItem = validationArguments.object as DeleteContactRequestItem;
    return hasText(requestItem.nameToDelete) || hasText(requestItem.phoneToDelete);
  }

  public defaultMessage(): string {
    return 'At least one of "nameToDelete" or "phoneToDelete" must be provided.';
  }
}

export class DeleteContactRequestItem {
  @IsOptional()
  @IsString()
  public readonly nameToDelete?: string;

  @IsOptional()
  @IsString()
  public readonly phoneToDelete?: string;

  @Validate(AtLeastOneDeleteContactFieldConstraint)
  public readonly atLeastOneFieldValidator = true;
}

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
