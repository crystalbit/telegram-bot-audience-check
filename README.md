# telegram-bot-audience-check

A tool for checking telegram bot audience

Uses sending typing action and checking for errors method

# Howto

Just run `npx telegram-bot-audience-check BOT_TOKEN data-test.json`,

where BOT_TOKEN is a bot token (like `5432947618:AAHg2R7rkaUoMv8zf9YcShGVf9R12goRx8k` or something)
and `data-test.json` is a file with ids

Files can be both json and txt. `data-*.json` files are gitignored.

Txt data should be a \n-separated list of ids like
```
23
34
456
```

Data json should be an array with any of following styles:
```
[
  123,
  456,
  789,
  { "id": 1234 },
  { "id": 5678 },
  { "id": { "$numberLong" : "12345" }}
]
```

The purpose was to proceed mongodb export files

TODO: handle time limits (goes to OTHER now)  
TODO: store resulting datasets, not only to show statistics  
