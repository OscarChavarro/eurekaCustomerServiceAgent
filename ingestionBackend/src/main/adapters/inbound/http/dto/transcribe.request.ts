import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class TranscribeRequest {
  @IsString()
  @IsNotEmpty()
  @Matches(/^https?:\/\/.+\.(opus|m4a|mp3)(?:$|[?#])/i, {
    message: 'url must be an http(s) url pointing to an .opus, .m4a or .mp3 resource'
  })
  url!: string;
}
