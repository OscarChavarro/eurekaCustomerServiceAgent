# WhatsApp Preprocessor

A simple TypeScript command-line tool that shortens WhatsApp-exported CSV filenames, media folder names, and media filenames.

## What it does

Given a root folder containing these subfolders:

- `csv`
- `media`

The tool:

1. Removes the `WhatsApp - ` prefix from filenames and folder names.
2. Tries to extract the contact phone number from the first `Incoming` row found in each CSV file.
3. If no `Incoming` phone is found, and the conversation name only contains digits, spaces, `(`, `)` and `+`, it strips non-digits and uses the resulting number.
4. If still unresolved, it loads contacts once from `contactsBackend` (`GET /contacts`) and tries to match by normalized conversation name.
5. The tool fails fast before processing if `GET /health` in `contactsBackend` is not available.
6. Renames each CSV file to `<phone>.csv`.
7. Renames the matching media folder to `<phone>`.
8. Renames media files inside that folder by removing the redundant contact name from the filename.
9. Writes unprocessed CSV filenames to `outlog/unprocessed.txt` when none of the strategies can resolve a phone number.

## Example

### CSV file

Before:

`WhatsApp - 10269 10180 María López clienta padre fa.csv`

After:

`34625347635.csv`

### Media folder and file

Before:

`WhatsApp - 10269 10180 María López clienta padre fa/2023-12-10 11 32 52 - 10269 10180 María López clienta padre fa - 9f2952b5-452d-467d-b78a-9b0faa4a734f.jpg`

After:

`34625347635/2023-12-10 11 32 52 - 9f2952b5-452d-467d-b78a-9b0faa4a734f.jpg`

## Requirements

- Node.js 18+ recommended
- npm

## Install

```bash
npm install
```

## Secrets configuration

Create `secrets.json` in the project root (same folder as `package.json`) using `secrets-example.json` as template:

```json
{
  "contactsBackend": {
    "baseUrl": "http://localhost:3669",
    "pageSize": 100,
    "requestTimeoutMs": 10000
  }
}
```

- `baseUrl`: base URL of `contactsBackend`.
- `pageSize`: page size sent to `GET /contacts?pageSize=<value>`.
- `requestTimeoutMs`: timeout for `/health` and `/contacts` requests.

## Build

```bash
npm run build
```

## Lint

```bash
npm run lint
```

## Run

```bash
npm run build
npm run start -- /path/to/root-folder
```

Where `/path/to/root-folder` contains:

```text
root-folder/
  csv/
  media/
```

## Output log

The tool creates:

```text
outlog/unprocessed.txt
```

Each line contains the original CSV filename that could not be processed by any strategy.

## Notes

- The tool modifies the filesystem in place.
- If a destination path already exists, the tool skips that rename and continues.
- Contact names are normalized by replacing special characters and emoji-like symbols with underscores to improve folder matching.
