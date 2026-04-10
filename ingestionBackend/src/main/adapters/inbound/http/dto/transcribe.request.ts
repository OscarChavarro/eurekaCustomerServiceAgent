import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class TranscribeRequest {
  @IsString()
  @IsNotEmpty()
  @Matches(/^https?:\/\/.+\.opus(?:$|[?#])/i, {
    message: 'url must be an http(s) url pointing to a .opus resource'
  })
  url!: string;
}

