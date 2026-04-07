import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GeneratedTextSensorshipService {
  public sanitizeGeneratedText(text: string): string {
    const phrases = text.match(/[^!.]+[!.]?/g) ?? [text];

    const sanitized = phrases
      .map((phrase) => phrase.trim())
      .filter((phrase) => phrase.length > 0)
      .filter((phrase) => !phrase.toLowerCase().includes('genial!'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return this.fixMalformedUrls(sanitized);
  }

  public fixMalformedUrls(text: string): string {
    let fixed = text;

    // Fix common malformed URLs like: http://eurekaregalos .com
    // and other accidental spaces around URL separators.
    const replacements: Array<[RegExp, string]> = [
      [/(https?:\/\/\S+)\s+\.(\S+)/gi, '$1.$2'],
      [/(https?:\/\/\S+)\s+\/(\S+)/gi, '$1/$2'],
      [/(https?:\/\/\S+)\s+\?(\S+)/gi, '$1?$2'],
      [/(https?:\/\/\S+)\s+#(\S+)/gi, '$1#$2'],
      [/(https?:\/\/\S+)\s+&(\S+)/gi, '$1&$2'],
      [/(https?:\/\/\S+)\s+=(\S+)/gi, '$1=$2']
    ];

    for (const [pattern, replacement] of replacements) {
      fixed = fixed.replace(pattern, replacement);
    }

    return fixed;
  }
}
