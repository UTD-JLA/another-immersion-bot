Before running the bot program make sure that you have:

1. a valid discord bot token with the GuildMembers intent enabled
2. yt-dlp installed
3. a MongoDB server to connect to
4. a valid config.json (or whatever file IB_CONFIG_LOCATION is set to) or have a
   the required options set with env variables. Most importantly: IB_TOKEN and
   IB_MONGO_URL (defaults to localhost)
5. started the py-server program (needed for the chart command to work)

For all config options, run `./another-immersion-bot help` and all of the valid
config.json keys and a short description of what they do will be listed.

Some variables can be set with environment variables:
IB_TOKEN
IB_LOG_LEVEL
IB_MATERIALS_PATH
IB_MONGO_URL
IB_CHART_SERVICE_URL
IB_LOCALES_PATH

To update the data files (autocomplete data), use the `data-update` program.
For additional options, run `./data-update -h`.

For more info see: https://github.com/UTD-JLA/another-immersion-bot
