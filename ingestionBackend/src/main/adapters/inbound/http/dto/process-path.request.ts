import { IsNotEmpty, IsString } from 'class-validator';

export class ProcessPathRequest {
  @IsString()
  @IsNotEmpty()
  path!: string;
}
