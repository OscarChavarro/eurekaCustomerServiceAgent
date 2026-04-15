type SupportedAudioExtension = 'opus' | 'mp3' | 'm2a' | 'm4a';

export class ImazingMediaUrlCandidateService {
  private static readonly SUPPORTED_AUDIO_EXTENSIONS: readonly SupportedAudioExtension[] = [
    'opus',
    'mp3',
    'm2a',
    'm4a'
  ];

  public isSupportedAudioResourceUrl(url: string): boolean {
    return this.extractAudioExtension(url) !== null;
  }

  public getCandidateAudioUrls(url: string): string[] {
    const currentExtension = this.extractAudioExtension(url);
    if (!currentExtension) {
      return [url];
    }

    const canonicalEncodedVariant = this.buildCanonicalEncodedVariant(url);
    const sameExtensionDoubleDotVariant = this.replaceAudioExtension(url, currentExtension, '..');
    const oneDotAlternatives = ImazingMediaUrlCandidateService.SUPPORTED_AUDIO_EXTENSIONS
      .map((extension) => this.replaceAudioExtension(url, extension, '.'))
      .filter((candidate): candidate is string => candidate !== null);
    const doubleDotAlternatives = ImazingMediaUrlCandidateService.SUPPORTED_AUDIO_EXTENSIONS
      .map((extension) => this.replaceAudioExtension(url, extension, '..'))
      .filter((candidate): candidate is string => candidate !== null);

    return [
      url,
      canonicalEncodedVariant,
      sameExtensionDoubleDotVariant,
      ...oneDotAlternatives,
      ...doubleDotAlternatives
    ].filter((candidate): candidate is string => !!candidate)
      .filter((candidate, index, array) => array.indexOf(candidate) === index);
  }

  private extractAudioExtension(url: string): SupportedAudioExtension | null {
    const path = this.extractPathFromUrl(url).toLowerCase();
    const match = path.match(/\.([a-z0-9]+)$/i);
    const extension = match?.[1] ?? '';

    if (
      ImazingMediaUrlCandidateService.SUPPORTED_AUDIO_EXTENSIONS.includes(
        extension as SupportedAudioExtension
      )
    ) {
      return extension as SupportedAudioExtension;
    }

    return null;
  }

  private replaceAudioExtension(
    url: string,
    extension: SupportedAudioExtension,
    dotSeparator: '.' | '..'
  ): string | null {
    const [base, suffix] = this.splitUrlBeforeQueryOrHash(url);
    const replacedBase = this.replacePathLastSegmentExtension(base, extension, dotSeparator);

    if (!replacedBase || replacedBase === base) {
      return null;
    }

    return `${replacedBase}${suffix}`;
  }

  private replacePathLastSegmentExtension(
    urlWithoutQueryOrHash: string,
    extension: SupportedAudioExtension,
    dotSeparator: '.' | '..'
  ): string | null {
    const slashIndex = urlWithoutQueryOrHash.lastIndexOf('/');
    if (slashIndex < 0 || slashIndex === urlWithoutQueryOrHash.length - 1) {
      return null;
    }

    const pathPrefix = urlWithoutQueryOrHash.slice(0, slashIndex + 1);
    const fileName = urlWithoutQueryOrHash.slice(slashIndex + 1);
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex <= 0) {
      return null;
    }

    const baseName = fileName.slice(0, dotIndex).replace(/\.+$/, '');
    if (!baseName) {
      return null;
    }

    return `${pathPrefix}${baseName}${dotSeparator}${extension}`;
  }

  private extractPathFromUrl(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return this.splitUrlBeforeQueryOrHash(url)[0];
    }
  }

  private splitUrlBeforeQueryOrHash(url: string): [string, string] {
    const match = url.match(/^([^?#]+)([?#].*)?$/);
    if (!match) {
      return [url, ''];
    }

    return [match[1] ?? url, match[2] ?? ''];
  }

  private decomposeBaseUrl(baseUrl: string): {
    originPrefix: string;
    leadingSlash: string;
    encodedSegments: string[];
  } | null {
    const absoluteMatch = baseUrl.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
    if (absoluteMatch) {
      const originPrefix = absoluteMatch[1] ?? '';
      const path = absoluteMatch[2] ?? '/';
      const leadingSlash = path.startsWith('/') ? '/' : '';
      const encodedSegments = path.replace(/^\/+/, '').split('/').filter((segment) => segment.length > 0);
      return { originPrefix, leadingSlash, encodedSegments };
    }

    const leadingSlash = baseUrl.startsWith('/') ? '/' : '';
    const encodedSegments = baseUrl
      .replace(/^\/+/, '')
      .split('/')
      .filter((segment) => segment.length > 0);
    return { originPrefix: '', leadingSlash, encodedSegments };
  }

  private decodeUrlComponentSafely(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private buildCanonicalEncodedVariant(url: string): string | null {
    const [base, suffix] = this.splitUrlBeforeQueryOrHash(url);
    const decomposition = this.decomposeBaseUrl(base);
    if (!decomposition) {
      return null;
    }

    const { originPrefix, leadingSlash, encodedSegments } = decomposition;
    if (encodedSegments.length === 0) {
      return null;
    }

    const canonicallyEncodedSegments = encodedSegments.map((segment) =>
      encodeURIComponent(this.decodeUrlComponentSafely(segment))
    );
    const canonicalBase = `${originPrefix}${leadingSlash}${canonicallyEncodedSegments.join('/')}`;
    if (canonicalBase === base) {
      return null;
    }

    return `${canonicalBase}${suffix}`;
  }
}
