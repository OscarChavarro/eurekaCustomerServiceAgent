We need to write a simple file preprocessing tool that renames folders and filenames.

# Data input

We have a single folder with to folder childs inside:
- csv: contains a set of .csv files, one per conversation, that follows the following structure:
```
Chat Session,Message Date,Sent Date,Type,Sender ID,Sender Name,Status,Forwarded,Replying to,Text,Reactions,Attachment,Attachment type,Attachment info
carmen 10263,2023-12-03 12:33:30,,Notification,,,,,,Messages to this chat and calls are now secured with end-to-end encryption,,,,
carmen 10263,2023-12-03 12:33:30,2023-12-03 12:33:30,Outgoing,,,Read,,,"Hola carmen buenos días, ayer nos hiciste un pedido de dos cuadros, tengo unas preguntas sobre el pedido",,,,
carmen 10263,2023-12-03 13:16:06,,Outgoing,,,Read,,,"¡Bienvenido a Eureka Regalos by Mafe.Lemes!  Somos una tienda en línea en *Madrid,España*.

Gracias por tu mensaje. En este momento no estamos disponibles, pero te responderemos tan pronto regresemos.",,,,
carmen 10263,2023-12-03 13:16:06,2023-12-03 13:19:15,Incoming,+34625347635,10263 Carmen,Read,,,Hola dime,,,,
```
- media: contains a set of folders that maps to conversations by contact name. Inside there are media files (image, video and audio) of several common extensions.

# The problem to solve

Using contacts and `WhatsApp - ` preffix makes both folders and files to have very long and confusing, difficult to work with. The objective of the new tool
will be to rename files and folders to make them shorter and easier to handle. Also, for contact names containing special unicode characters and emojis, the
names follows a convention of replaching special characters with underscore `_`.
The tool will do this by:
- Removing the `WhatsApp - ` preffix
- Replacing contact names with phone numbers from inside the .csv data

For example, filename `WhatsApp - 10269 10180 María López clienta padre fa.csv` will become `34625347635`, given contentin previous section.

For media files, a long name as such
`WhatsApp - 10269 10180 María López clienta padre fa/2023-12-10 11 32 52 - 10269 10180 María López clienta padre fa - 9f2952b5-452d-467d-b78a-9b0faa4a734f.jpg`
will become
`34625347635/2023-12-10 11 32 52 - 9f2952b5-452d-467d-b78a-9b0faa4a734f.jpg`

after removing redundant contact name in filename (can use parent folder name) and replacing contact with phone number.

Program will receive as argument the name of the folder containing those two subfolders, and when determining how to rename the files and folders, should go for it
and modify paths in current filesystem.

# Extracting phone numbers

Phone number information can be extracted from first messages with `Incoming` Type. If csv file does not contain any Incoming type, will not be processed and will be included in `outlog/unprocessed.txt` file.

# Technology to use in this tool

Tool whould be created by:
- Typescript programming language
- Program user should use `npm install`, `npm run build` and `npm run start` commands, so we should provide a corresponding `package.json` file
- Program will not include any testing, but will organize all `.ts` files under `src/main` folder
- From an object oriented design perspective, program should be organized following hexagonal architecture.
- Code should include an English `README.md` with a guide on how to build and use the program.
- Project should include tslint and a npm run lint target.

Your objective is to provide a compressed file containing the new node / TypeScript project.
