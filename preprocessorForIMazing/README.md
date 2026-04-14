# WhatsApp Preprocessor

A simple TypeScript command-line tool that shortens WhatsApp-exported CSV filenames, media folder names, and media filenames.

## What it does

Given a root folder containing these subfolders:

- `csv`
- `media`

The tool:

1. Creates auxiliary folders at root: `csv_groups`, `csv_disabled`, and `csv_unsupported`.
2. Scans `csv` and moves group-conversation files to `csv_groups`.
3. Moves matching media conversation folders to `media/_groups`.
4. Group detection looks for messages like `<user> created community '<groupName>'` and matches `<groupName>` against the CSV conversation name pattern; it also supports `<user> created this community`.
5. Moves to `csv_disabled` CSV files whose conversation name matches any pattern in `etc/disabledContacts.json`.
6. Moves to `csv_unsupported` CSV files containing messages like `<digits> es tu código de confirmación de Facebook` (for example OTP conversations).
7. Removes the `WhatsApp - ` prefix from filenames and folder names.
8. Tries to extract the contact phone number from the first `Incoming` row found in each CSV file.
9. If no `Incoming` phone is found, and the conversation name only contains digits, spaces, `(`, `)` and `+`, it strips non-digits and uses the resulting number.
10. If still unresolved, it loads contacts once from `contactsBackend` (`GET /contacts`) and tries to match by normalized conversation name.
11. The tool fails fast before processing contacts if `GET /health` in `contactsBackend` is not available.
12. Renames each CSV file to `<phone>.csv`.
13. Renames the matching media folder to `<phone>`.
14. Renames media files inside that folder by removing the redundant contact name from the filename.
15. Moves unresolved CSV files from `csv` to `csv_unsupported` when none of the strategies can resolve a phone number.
16. Writes `outlog/unprocessed.txt` with only the CSV filenames that were actually moved to `csv_unsupported`.

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
    _groups/
  csv_groups/
  csv_disabled/
  csv_unsupported/
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
