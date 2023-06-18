# Setup
#### [(or skip to Docker)](#docker)
## Requirements
1. Node.js (>=16.9.0) and NPM 
2. MongoDB server
3. Discord bot application (with privilaged GuildMembers intent)
4. Python3
5. yt-dlp

## Config
There should either be a file `config.json` in your CWD or you should set the environment variable `IB_CONFIG_LOCATION=/some/path/config.json`.
Individual variables can be set by setting `IB_SOME_VAR` (ex. `IB_MONGO_URL`, `IB_CHART_SERVICE_URL`, etc). Variables from the config file
will precede environment variables.
Current config variables are as follows:

Name |  Description | Default | Required
-----|--------------|---------|---------|
mongoUrl | The URI used to connect to the database | mongodb://localhost:27017 | Yes
token | Discord bot token | N/A | Yes
chartServiceUrl | URL of http server that generated chart PNG files | http://127.0.0.1:5301/bar | Works but returns error response when /chart is used
materialsPath | Path to folder containing autocomplete titles | Provided data folder  | No
logLevel | Level to set the logging service | info | No

#### materialsPath
Files in this directory should be in the format LANG.TYPE.optional-stuff and should be a list of autocomplete entries seperated by a new-line character.
View the /data folder as an example.

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
