import fs from "fs";
import path from "path";
import readline from "readline";
import { ChildProcess, spawn } from "child_process";

const defaultCallThreshold: string = "1000" // $1000

enum COMMAND {
    FOLD = "fold",
    CHECK = "check",
    CALL = "call",
    ALL_IN = "all_in",
    EXIT = "exit",
}

const actions: COMMAND[] = [COMMAND.CHECK, COMMAND.CALL, COMMAND.FOLD, COMMAND.ALL_IN];

let currCommand = COMMAND.CHECK;

let version = 0;

function getNewBotID(botIDs: string[]) {
    botIDs.sort((a, b) => Number(a) - Number(b));
    const val = botIDs.findIndex((id, index) => Number(id) !== index); // look for a gap
    const newID = val < 0 ? botIDs.length : val;
    return newID.toString();
}

function getCommandPath(botID: string) {
    return path.resolve(
        process.env.HOME!,
        "GitHub/PokerBot",
        "bots",
        botID,
        "command.txt"
    );
}

function getLogPath(botID: string) {
    return path.resolve(
        process.env.HOME!,
        "GitHub/PokerBot",
        "bots",
        botID,
        `bot_${botID}.log`
    );
}

function writeCommand(id: string, cmd: COMMAND, version: number) {
    if (actions.includes(cmd) && cmd !== currCommand) {
        currCommand = cmd;
    }
    const path = getCommandPath(id);
    const payload = { version, command: cmd };
    fs.writeFileSync(path, JSON.stringify(payload), "utf8");
    console.log(`Wrote command: ${cmd} (version ${version})`);
    if (cmd === COMMAND.EXIT) {
        setTimeout(() => fs.writeFileSync(path, "", "utf8"), 10000);
    }
}

function writeToAll(botIDs: string[], cmd: COMMAND) {
    version++;
    for (const id of botIDs) {
        writeCommand(id, cmd, version);
    }
}

function spawnBot(botID: string, url: string, callThreshold: string, log: number) : ChildProcess {
    return spawn("ts-node", ["bot.ts"], {
        env: { ...process.env, BOT_ID: botID, TARGET_URL: url, CALL_THRESHOLD: callThreshold },
        stdio: ["ignore", log, log],
        detached: true,
    });
}

function setupBot(botID: string, TARGET_URL: string, callThreshold: string): ChildProcess {
    const commandPath = getCommandPath(botID);
    
    // Ensure bots/$botID dir exists
    fs.mkdirSync(path.dirname(commandPath), { recursive: true });
    writeCommand(botID, currCommand, version);
    
    const logPath = getLogPath(botID);
    fs.writeFileSync(logPath, "", "utf8"); // clear log first
    const botLog = fs.openSync(logPath, "a");

    // Launch bot.ts as child process
    const bot: ChildProcess = spawnBot(botID, TARGET_URL, callThreshold, botLog);
    
    fs.writeSync(botLog, `\n=== Starting BOT_ID=${botID} (pid=${bot.pid}) ===\n`);
    bot.unref();
    console.log(`Launched bot ${botID}, logging to ${logPath}, pid=${bot.pid}`);

    return bot;
}

function killBot(bot: ChildProcess) {
    bot.kill(); // not enough
    if (bot.pid) {
        try { process.kill(-bot.pid, 'SIGKILL'); } catch {}
    }
}

function killAllBots(botIDs: string[], bots: Record<string, ChildProcess>) {
    for (const id of botIDs) {
        killBot(bots[id]);
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
    // Startup prompts
    const numBotsStr = (await ask("How many bots? (default 1): ")).trim();
    const numBots = Number(numBotsStr) || 1;

    let callThreshold = (await ask(`Enter the threshold amount to Fold on a Call (default $${defaultCallThreshold}): `)).trim();
    if (!callThreshold || !Number(callThreshold)) {
        callThreshold = defaultCallThreshold;
    }
    
    const TARGET_URL = (await ask("Enter the Target URL: ")).trim();
    if (!TARGET_URL) {
        console.error("The Target URL is required.");
        process.exit(1);
    }
    
    let botIDs: string[] = Array.from({ length: numBots }, (_, i) => i.toString());
    const bots: Record<string, ChildProcess> = {};

    for (const botID of botIDs) {
        bots[botID] = setupBot(botID, TARGET_URL, callThreshold);
    }

    function prompt() {
        rl.question(
            "\nChoose command:\n check: 1\n call: 2\n all in: 3\n fold: 4\n ...\n list all bots: 7\n spawn new bot: 8\n kill a bot: 9\n exit: 0\n> ",
            (answer) => {
            const cmd = answer.trim().toLowerCase();

            switch (cmd) {
                case "1":
                    writeToAll(botIDs, COMMAND.CHECK);
                    break;
                case "2":
                    writeToAll(botIDs, COMMAND.CALL);
                    break;
                case "3":
                    writeToAll(botIDs, COMMAND.ALL_IN);
                    break;
                case "4":
                    writeToAll(botIDs, COMMAND.FOLD);
                    break;
                // ...
                case "7": // List
                    console.log(`The current bots are: [${botIDs.toString()}]`);
                    break;
                case "8": // Spawn
                    const newBotID: string = getNewBotID(botIDs);
                    botIDs.push(newBotID);
                    botIDs.sort((a, b) => Number(a) - Number(b));
                    bots[newBotID] = setupBot(newBotID, TARGET_URL, callThreshold);
                    break;
                case "9": // Kill
                    rl.question(
                        `\nChoose the BotID to Kill [${botIDs.toString()}]: `,
                        (_botID) => {
                            if (!botIDs.includes(_botID)) {
                                console.log(_botID + ` is not a current BotID`);
                            } else {
                                const _bot = bots[_botID];
                                if (_bot) {
                                    writeCommand(_botID, COMMAND.EXIT, ++version); // version doesnt matter
                                    setTimeout(() => killBot(_bot), 5000);
                                    botIDs = botIDs.filter(x => x !== _botID);
                                    delete bots[_botID];
                                }

                                rl.question(
                                    `\nWould you like to restart that Bot? (y | n): `,
                                    (answer) => {
                                        if (answer === 'y') {
                                            const botLog = fs.openSync(getLogPath(_botID), "a");
                                            const newBot: ChildProcess = spawnBot(_botID, TARGET_URL, callThreshold, botLog);
                                            botIDs.push(_botID);
                                            botIDs.sort((a, b) => Number(a) - Number(b));
                                            bots[_botID] = newBot;
                                            writeCommand(_botID, currCommand, version); 
                                            fs.writeSync(botLog, `\n=== Starting BOT_ID=${_botID} (pid=${newBot.pid}) ===\n`);
                                            newBot.unref();
                                            console.log(`Launched bot ${_botID}, logging to ${`bot_${_botID}.log`}, pid=${newBot.pid}`);
                                        }
                                        prompt();
                                    }
                                );
                            }
                            prompt();
                        }
                    );
                    break;
                case "0":
                    writeToAll(botIDs, COMMAND.EXIT);
                    console.log("Exiting manager...");
                    rl.close();
                    setTimeout(() => killAllBots(botIDs, bots), 5000);
                    return;
                default:
                    console.log("Invalid command. Try again.");
            }

            prompt();
            
            }
        );
    }

    prompt();
}

main();
