import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateContactRequest {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly names?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly emailAddresses?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly phoneNumbers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly biographies?: string[];
}
