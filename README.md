# Setup
#### [(or skip to Docker)](#docker)
## Requirements
1. Node.js (>=16.9.0) and NPM 
2. MongoDB server
3. Discord bot application (with privilaged GuildMembers intent)
4. Python3

## Config
There should either be a file `config.json` in your CWD or you should set the environment variable `IB_CONFIG_LOCATION=/some/path/config.json`.
Current config variables are as follows:

Name |  Description | Required
-----|--------------|---------|
mongoUrl | The URI used to connect to the database | [x]
token | Discord bot token | [x]
autocompletionDataFile | The path of a text file containing new-line seperated titles of anime/manga/etc. to be used for autocompletion | [x]

## Running
Use `npm i` to install the packages required for running the project after it's been compiled. For development, run `npm i -D` to also
install the packages required for compilation.

Execute `npm run start` to quickly compile and run the project as is. If the project is already compiled simply run `node build/index.js`.
For development, it is quicker to run `npx tsc --watch` in the background and restart the bot using `node build/index.js` after making changes.

The bot also makes use of the HTTP server found in `py-server` to generate graphs. Make sure to install the requirements and run this
server or else the bot will not be able to create graphs.

### Docker
Now works with Docker! Just use `docker compose up` and the data files and database installation will be done for you. The only thing that
is missing is the Discord bot token. Create a file `.env` and set the contents to be `IB_TOKEN=YOUR_TOKEN` or map a config file to
provide the token.

# Todos
- JA localisations for commands
- Graphs and charts
- Better autocomplete (allow filtering by sources such as vndb)
- Non-logging functionality? (ex. dictionaries)
- Efficient pagination
- Efficient autocomplete title lookup (data is sorted but is being searched linearly)
- Per guild channel limitations
- Per guild localisation settings for dates and times
- Maybe don't use mongodb (maybe too late I'm too lazy)
