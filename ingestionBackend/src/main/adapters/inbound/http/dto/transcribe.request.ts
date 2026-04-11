import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class TranscribeRequest {
  @IsString()
  @IsNotEmpty()
  @Matches(/^https?:\/\/.+\.(opus|mp3|m2a|m4a)(?:$|[?#])/i, {
    message: 'url must be an http(s) url pointing to an .opus, .mp3, .m2a or .m4a resource'
  })
  url!: string;
}
