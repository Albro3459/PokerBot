# PokerBot

This mini project is for managing and running poker bots for on [PokerPatio](https://pokerpatio.com/lobbies).

This is purely just for fun. Poker Patio is a free website and there is no money involved.

This was made with `TypeScript`, `Node` (with `ts-node`), and `Playwright` to control the website.

You can run with `npm run manager`. If this is you first run, you need to run `npm install` for the packages.

You need to create a `usernames.ts` file and put in usernames into a string array for the bot file to use. I recommend 11 chars or less to see the Bot ID at the end.
Also, no special characters, even spaces or dashes or periods. The website doesn't allow them. Username examples are like 'john' and 'MyUsername'. Just basic letters and numbers only.

It will ask you how many bots you want, what the call threshold is (the limit where they will fold), and the Poker Patio game URL.

By default they will Check (or Fold/Call depending on the call threshold), but with the prompt in the terminal, you can have they Call, go All In, or Fold by entering the number next to the command.

You can also List All bots, Spawn a new bot, and Kill (and optionally restart) a current bot.

The bots username will have their Bot ID at the end so you can identify which bot they are.

You can also Exit, which will clean up all the bots. If you don't exit, then you need to kill the Node processes in your OS's Activity/Task Manager.

Note:
The bots are not smart. They will stay on their current command until you give them another command. They start on Check, but if you tell them All In, then they will keep going All In until you give them another command. 

I recommend giving them a command on your turn, then playing your turn after a second or two and then waiting for it to come back around to your turn and giving them another command.

If you say All In, then your first bot will go All In, but if you then tell them to Check, they will switch to Check. They have no concept of a "turn". You can't give them a command for just one turn. They will keep doing the same command.

If you want to watch what they're doing, set `Headless` to true and their browsers will actually open.

Also, you might have to change the path's for the Command and Log files in `Manager.ts` and `Bot.ts`.