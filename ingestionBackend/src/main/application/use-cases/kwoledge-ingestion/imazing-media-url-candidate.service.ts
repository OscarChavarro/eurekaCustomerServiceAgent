type SupportedAudioExtension = 'opus' | 'mp3' | 'm2a' | 'm4a';

export class ImazingMediaUrlCandidateService {
  private static readonly SUPPORTED_AUDIO_EXTENSIONS: readonly SupportedAudioExtension[] = [
    'opus',
    'mp3',
    'm2a',
    'm4a'
  ];
  private static readonly NON_BREAKING_SPACE_UNICODE = '\u00A0';
  private static readonly LEFT_TO_RIGHT_EMBEDDING_UNICODE = '\u202A';
  private static readonly POP_DIRECTIONAL_FORMATTING_UNICODE = '\u202C';

  public isSupportedAudioResourceUrl(url: string): boolean {
    return this.extractAudioExtension(url) !== null;
  }

  public getCandidateAudioUrls(url: string): string[] {
    const currentExtension = this.extractAudioExtension(url);
    if (!currentExtension) {
      return [url];
    }

    const canonicalEncodedVariant = this.buildCanonicalEncodedVariant(url);
    const firstPassAlternatives = ImazingMediaUrlCandidateService.SUPPORTED_AUDIO_EXTENSIONS
      .filter((extension) => extension !== currentExtension)
      .map((extension) => this.replaceAudioExtension(url, extension))
      .filter((candidate): candidate is string => candidate !== null);
    const secondPassWithNbsp = this.buildAlternativesWithNbspBaseName(url);
    const thirdPassWithDirectionalWrappedContact =
      this.buildAlternativesWithDirectionalWrappedContact(url);

    return [
      url,
      canonicalEncodedVariant,
      ...firstPassAlternatives,
      ...secondPassWithNbsp,
      ...thirdPassWithDirectionalWrappedContact
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

  private replaceAudioExtension(url: string, extension: SupportedAudioExtension): string | null {
    const [base, suffix] = this.splitUrlBeforeQueryOrHash(url);
    const replacedBase = this.replacePathLastSegmentExtension(base, extension);

    if (!replacedBase || replacedBase === base) {
      return null;
    }

    return `${replacedBase}${suffix}`;
  }

  private buildAlternativesWithNbspBaseName(url: string): string[] {
    const withNbspContactLabel = this.replaceContactLabel(url, (contactLabel) =>
      contactLabel.replace(/ /g, ImazingMediaUrlCandidateService.NON_BREAKING_SPACE_UNICODE)
    );
    if (!withNbspContactLabel) {
      return [];
    }

    const withNbspCurrentExtension = withNbspContactLabel;
    const withNbspOtherExtensions = ImazingMediaUrlCandidateService.SUPPORTED_AUDIO_EXTENSIONS
      .map((extension) => this.replaceAudioExtension(withNbspContactLabel, extension))
      .filter((candidate): candidate is string => candidate !== null);

    return [withNbspCurrentExtension, ...withNbspOtherExtensions].filter(
      (candidate, index, array) => array.indexOf(candidate) === index
    );
  }

  private buildAlternativesWithDirectionalWrappedContact(url: string): string[] {
    const wrappedFromOriginal = this.replaceContactLabel(url, (contactLabel) =>
      this.wrapContactLabelWithDirectionalUnicode(contactLabel)
    );
    const wrappedFromNbsp = this.replaceContactLabel(url, (contactLabel) =>
      this.wrapContactLabelWithDirectionalUnicode(
        contactLabel.replace(/ /g, ImazingMediaUrlCandidateService.NON_BREAKING_SPACE_UNICODE)
      )
    );
    const wrappedCandidates = [wrappedFromOriginal, wrappedFromNbsp].filter(
      (candidate): candidate is string => !!candidate
    );

    const withExtensions = wrappedCandidates.flatMap((candidate) => [
      candidate,
      ...ImazingMediaUrlCandidateService.SUPPORTED_AUDIO_EXTENSIONS
        .map((extension) => this.replaceAudioExtension(candidate, extension))
        .filter((value): value is string => !!value)
    ]);

    return withExtensions.filter((candidate, index, array) => array.indexOf(candidate) === index);
  }

  private replaceContactLabel(
    url: string,
    transformer: (contactLabel: string) => string
  ): string | null {
    const [base, suffix] = this.splitUrlBeforeQueryOrHash(url);
    const decomposition = this.decomposeBaseUrl(base);
    if (!decomposition) {
      return null;
    }

    const { originPrefix, leadingSlash, encodedSegments } = decomposition;
    if (encodedSegments.length < 2) {
      return null;
    }

    const folderIndex = encodedSegments.length - 2;
    const fileIndex = encodedSegments.length - 1;
    const encodedFolder = encodedSegments[folderIndex];
    const encodedFileName = encodedSegments[fileIndex];
    if (!encodedFolder || !encodedFileName) {
      return null;
    }

    const decodedFolder = this.decodeUrlComponentSafely(encodedFolder);
    const decodedFileName = this.decodeUrlComponentSafely(encodedFileName);

    const contactLabel = this.extractContactLabelFromFolder(decodedFolder);
    if (!contactLabel) {
      return null;
    }

    const transformedContactLabel = transformer(contactLabel);
    if (!transformedContactLabel || transformedContactLabel === contactLabel) {
      return null;
    }

    const transformedFolder = decodedFolder.replace(contactLabel, transformedContactLabel);
    const transformedFileName = decodedFileName.replace(contactLabel, transformedContactLabel);
    if (transformedFolder === decodedFolder && transformedFileName === decodedFileName) {
      return null;
    }

    const transformedSegments = [...encodedSegments];
    transformedSegments[folderIndex] = encodeURIComponent(transformedFolder);
    transformedSegments[fileIndex] = encodeURIComponent(transformedFileName);

    const rebuiltPath = `${leadingSlash}${transformedSegments.join('/')}`;
    return `${originPrefix}${rebuiltPath}${suffix}`;
  }

  private wrapContactLabelWithDirectionalUnicode(contactLabel: string): string {
    return `${ImazingMediaUrlCandidateService.LEFT_TO_RIGHT_EMBEDDING_UNICODE}${contactLabel}${ImazingMediaUrlCandidateService.POP_DIRECTIONAL_FORMATTING_UNICODE}`;
  }

  private replacePathLastSegmentExtension(
    urlWithoutQueryOrHash: string,
    extension: SupportedAudioExtension
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

    const baseName = fileName.slice(0, dotIndex);
    return `${pathPrefix}${baseName}.${extension}`;
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

  private extractContactLabelFromFolder(folderName: string): string | null {
    const trimmed = folderName.trim();
    if (!trimmed) {
      return null;
    }

    const withoutPrefix = trimmed.replace(/^whatsapp\s*-\s*/i, '').trim();
    return withoutPrefix.length > 0 ? withoutPrefix : null;
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
