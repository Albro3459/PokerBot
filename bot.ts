import { Browser, chromium, Page } from "playwright";
import fs from "fs";
import path from "path";
import { usernames } from "./usernames";

// DEFINE:
const botID = process.env.BOT_ID || "-1";
const targetUrl = process.env.TARGET_URL;
let callThreshold = process.env.CALL_THRESHOLD || "1000";

const headless: boolean = true; // headless means no browser window UI

const commandInterval = 500; // 1000 ms === 1 sec

const logInTimeout = 30000; // 30 sec
const actionTimeout = 2000; // 2 sec

const defaultCallThreshold: string = "1000"; // default to $1000

enum COMMAND {
    FOLD = "fold",
    CHECK = "check",
    CALL = "call",
    BET = "bet",
    MAX = "max",
    RAISE = "raise",
    ALL_IN = "all_in",
    EXIT = "exit",
    STAY_ACTIVE = "set_away_off",
    POPUP = "close_popup",
    SEAT = "request_seat_join",
    REBUY = "rebuy_seat_free",
    REFRESH = "refresh_page",
}

const map: Record<COMMAND, string> = {
  [COMMAND.FOLD]: "fold",
  [COMMAND.CHECK]: "check",
  [COMMAND.CALL]: "call",
  [COMMAND.BET]: "open_raise",
  [COMMAND.MAX]: "max",
  [COMMAND.RAISE]: "raise",
  [COMMAND.ALL_IN]: "all_in",
  [COMMAND.EXIT]: "exit_lobby_popup",
  [COMMAND.STAY_ACTIVE]: "set_away_off",
  [COMMAND.POPUP]: "close_popup",
  [COMMAND.SEAT]: "request_seat_join",
  [COMMAND.REBUY]: "rebuy_seat_free",
  [COMMAND.REFRESH]: "refresh_page",
};

type CommandVersion = {
    version: number;
    command: COMMAND;
};

type CommandState = {
  currCommand: COMMAND;
  prevVersion: number;
};

const state: CommandState = {
  currCommand: COMMAND.CHECK,
  prevVersion: -1,
};

// Helpers

const getUsername = (botID: string) : string => {
    // usernames cant be longer than 12 chars total or they get cutoff
        // make them 11 or less to show the ending ID
    return usernames[Math.floor(Math.random() * usernames.length)] + botID;
};

async function refresh(page: Page, url: string, botID: string) {
    console.log("*Refreshing...");
    try {
        await page.waitForSelector(`[data-action-type="${map[COMMAND.REFRESH]}"]`, { timeout: 1000 });
        
        await page.locator(`[data-action-type="${map[COMMAND.REFRESH]}"]`).first().click({ timeout: 1000 });
        console.log("Clicked Refresh button");

        const usernameInput = page.locator('input[name="set_username"]');

        if (await usernameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
            console.log("Need to Log back in after Refresh...");
            while (!await login(page, url, botID)) {
                const wait = 1000;
                console.log(`Waiting ${wait/1000} second${wait/1000 === 1 ? '' : 's'} to try logging in again`);
                await new Promise(r => setTimeout(r, wait));
            }
        }

        console.log("REFRESH SUCCESSFUL");
    } catch (e) {
        console.log("No Refresh button found", e);
        // console.log("No Refresh button found");
    }
}


async function stayActive(page: Page) {
    console.log("*Staying Active..");
    try {
        await page.waitForSelector(`[data-action-type="${map[COMMAND.STAY_ACTIVE]}"]`, { timeout: 1000 });
        await page.locator(`[data-action-type="${map[COMMAND.STAY_ACTIVE]}"]`).first().click({ timeout: 1000 });

        console.log("STAYED ACTIVE SUCCESSFUL");
    } catch (e) {
        console.log(`Failed to Stay Active`, e);
        // console.log(`Failed to Stay Active`);
    }
}

async function buyBack(page: Page) {
    console.log("*Buying Back...");
    try {
        // close popup
        const popupBtn = page.locator(`[data-action-type="${COMMAND.POPUP}"]`).first();
        if (await popupBtn.isVisible({ timeout: actionTimeout }).catch(() => false)) {
            await popupBtn.click({ timeout: actionTimeout });
            console.log("Closed popup");
            await page.waitForTimeout(300);
        } else {
            console.log("No popup to close. Continuing...");
            return true; // no popup
        }

        // attempt to pick a seat
        for (let attempt = 0; attempt < 5; attempt++) {
            const sitBtn = page.locator(
                `[data-action-type="${COMMAND.SEAT}"][data-type="clicked_on_seat"]`
            ).first();

            if (await sitBtn.isEnabled({ timeout: actionTimeout }).catch(() => false)) {
                await sitBtn.click({ timeout: actionTimeout });
                console.log("Picked seat");
                await page.waitForTimeout(300);

                // rebuy
                const rebuyBtn = page.locator(
                    `[data-action-type="${COMMAND.SEAT}"][data-type="${COMMAND.REBUY}"]`
                ).first();

                if (await rebuyBtn.isEnabled({ timeout: actionTimeout }).catch(() => false)) {
                    await rebuyBtn.click({ timeout: actionTimeout });
                    console.log("BUY BACK SUCCESSFUL");
                    return true;
                }
            }

            console.log("Seat attempt failed, retrying...");

            if (attempt === 4) {
                await page.reload({ timeout: logInTimeout / 2, waitUntil: "domcontentloaded" });
                await page.waitForTimeout(300);
            }
        }

        console.log("BUY BACK SUCCESSFUL");
    } catch (e) {
        console.log("Failed to Buy Back", e);
        // console.log("Failed to Buy Back");
    }
    return false;
}

async function handlePopup(page: Page) {
    console.log("*Handling Popup...");
    const popupBtn = page.locator(`[data-action-type="${map[COMMAND.POPUP]}"]`).first();

    if (await popupBtn.isVisible({ timeout: actionTimeout })) {
        console.log("Popup detected, closing...");
        await popupBtn.click({ timeout: actionTimeout });

        await page.waitForTimeout(300);

        console.log("POPUP SUCCESSFUL");

        return true;
    }

    console.log("No POPUP found");
    return false;
}

// MAIN Funcs

async function login(page: Page, url: string, botID: string): Promise<boolean> {
    console.log("*Login...");
    try {
        await page.goto(url, { timeout: logInTimeout, waitUntil: "domcontentloaded" });

        const usernameInput = page.locator('input[name="set_username"]');
        const joinBtn = page.locator('[data-action-type^="set_username"]').first(); // match common: "set_username_join_lobby" and uncommon: "set_username"
        const errorBox = page.locator('.error-txt');

        // try multiple usernames
        let username = getUsername(botID);
        let success = false;

        for (const i in usernames) {
            console.log(`Trying username: ${username}`);
            await usernameInput.fill(username, { timeout: actionTimeout });
            await joinBtn.click({ timeout: actionTimeout });

            await page.waitForTimeout(250);

            const errorText = (await errorBox.textContent({ timeout: actionTimeout }))?.trim();
            if (errorText) {
                console.log(`Username failed: ${errorText}`);
                username = getUsername(botID);
                continue; // try next one
            }

            success = true;
            break;
        }

        if (!success) {
            throw new Error("All username attempts failed");
        }

        await page.waitForTimeout(250);
        
        // seat selection with popup retry
        for (let attempt = 0; attempt < 5; attempt++) {
            const sitBtn = page.locator(`[data-action-type="${COMMAND.SEAT}"]`).first();
            if (await sitBtn.isEnabled({ timeout: actionTimeout })) {
                await sitBtn.click({ timeout: actionTimeout });
                await page.waitForTimeout(300);

                if (await handlePopup(page)) {
                    console.log("Seat taken, retrying...");

                    if (attempt === 4) {
                        await page.reload({ timeout: logInTimeout / 2, waitUntil: 'domcontentloaded' });
                        await page.waitForTimeout(300);
                    }
                    continue; // retry seat selection
                }

                console.log("LOGIN SUCCESSFUL");
                return true;
            }
        }

        throw new Error("Seat selection failed after retries"); // caught by the catch

    } catch (e) {
        console.log("Failed to login:", e);
        return false
    }
}

async function fold(page: Page) {
    console.log("*Folding...");
    try {
        await page.waitForSelector(`[data-action-type="${map[COMMAND.FOLD]}"]`, { timeout: actionTimeout / 2 });
        await page.locator(`[data-action-type="${map[COMMAND.FOLD]}"]`).first().click({ timeout: actionTimeout / 2 });

        console.log("FOLD SUCCESSFUL");
    } catch (e) {
        console.log(`Failed to Fold`, e);
        // console.log(`Failed to Fold`);
    }
}

async function checkOrFold(page: Page, singleCall: boolean = false) {
    console.log("*Checking...");
    try {
        await page.waitForSelector(`[data-action-type="${map[COMMAND.CHECK]}"]`, { timeout: actionTimeout / (singleCall ? 2 : 1) }).catch(async (e) => {
            if (singleCall) {
                console.log(`Failed on Check`);
                return;
            }
            
            console.log("Can't find check, checking value of CALL");
            const value = await page.textContent(`.btn[data-action-type="${map[COMMAND.CALL]}"] span`, { timeout: actionTimeout / 2 }); 
            if (!value) {
                console.log("Can't find CALL value. Failed to Call or Check. Folding...");
                await fold(page);
                return;
            }
            const num = Number(value.replace('$', ''));
            console.log(`CALL value: ${num} | Call Threshold: ${callThreshold}`);

            const threshold = Number(callThreshold);

            if (num > threshold) {
                console.log(num + " is HIGHER than the call threshold. FOLDING...");
                await fold(page);
            } else {
                console.log(num + " is LOWER than the call threshold "+ threshold +". CALLING...");
                await call(page, threshold , true);
            }

            await page.waitForTimeout(250); // wait
        });
        await page.locator(`[data-action-type="${map[COMMAND.CHECK]}"]`).first().click({ timeout: actionTimeout / (singleCall ? 2 : 1) });

        console.log("CHECK SUCCESSFUL");
    } catch (e) {
        console.log(`Failed to Check:`, e);
        // console.log(`Failed to Check`);
    }
}

async function call(page: Page, expectedValue: number | null | undefined,  singleCall: boolean = false) {
    console.log("*Calling...");
    try {
        await page.waitForSelector(`[data-action-type="${map[COMMAND.CALL]}"]`, { timeout: actionTimeout / (singleCall ? 2 : 1) }).catch(async (e) => {
            if (singleCall) {
                console.log(`Failed on Call`);
                return;
            }

            await checkOrFold(page, true);

            await page.waitForTimeout(250); // wait

        });

        if (!expectedValue) { // no expected value means call
            await page.locator(`[data-action-type="${map[COMMAND.CALL]}"]`).first().click({ timeout: actionTimeout / (singleCall ? 2 : 1) }).catch(async() => {
                await checkOrFold(page, true);
            });
    
            console.log("CALL SUCCESSFUL");
        } else {
            const value = await page.textContent(`.btn[data-action-type="${map[COMMAND.CALL]}"] span`, { timeout: actionTimeout / 2 }); 
            if (!value) {
                console.log("Can't find Call value");
                throw new Error("Can't find Call value");
                return;
            }
            const num = Number(value?.replace('$', ''));

            if (num <= expectedValue) { // if there is an expected value then call if num <= expectedValue
                console.log(`Calling value: ${num}`);
        
                await page.locator(`[data-action-type="${map[COMMAND.CALL]}"]`).first().click({ timeout: actionTimeout / (singleCall ? 2 : 1) });
        
                console.log("CALL SUCCESSFUL");
            } else {
                console.log(`Race Condition caught when calling. Value: ${num} | Expected Value: ${expectedValue}`);
                throw new Error(`Race Condition caught when calling. Value: ${num} | Expected Value: ${expectedValue}`);
            } 
        }


    } catch (e) {
        console.log(`Failed to Call`, e);
        // console.log(`Failed to Call`);
    }
}

async function allIn(page: Page) {
    console.log("*All In...");
    try {
        const betBtn = page.locator(`[data-action-type="${map[COMMAND.BET]}"]`).first();

        // If bet is disabled, fall back to CALL immediately
        if (!(await betBtn.isEnabled({ timeout: actionTimeout }))) {
            console.log("Bet button disabled, falling back to CALL");
            await call(page, null);
            return;
        }

        await betBtn.click({ timeout: actionTimeout });
        await page.waitForTimeout(250);

        const maxBtn = page.locator(`.quick-raise-amount[data-type="${map[COMMAND.MAX]}"]`).first();
        if (!(await maxBtn.isEnabled({ timeout: actionTimeout }))) {
            console.log("Max button disabled, falling back to CALL");
            await call(page, null);
            return;
        }
        await maxBtn.click({ timeout: actionTimeout });
        await page.waitForTimeout(250);

        const raiseBtn = page.locator(`[data-action-type="${map[COMMAND.RAISE]}"]`).first();
        if (!(await raiseBtn.isEnabled({ timeout: actionTimeout }))) {
            console.log("Raise button disabled, falling back to CALL");
            await call(page, null);
            return;
        }
        await raiseBtn.click({ timeout: actionTimeout });

        console.log("ALL IN SUCCESSFUL");
    } catch (e) {
        console.log(`Failed to go All In, falling back to CALL:`, e);
        await call(page, null);
    }
}


async function exit(page: Page) {
    console.log("*Exit...");
    try {
        await page.waitForSelector(`.btn[data-action-type="show_popup"][data-type="${map[COMMAND.EXIT]}"]`, { timeout: actionTimeout });
        await page.locator(`.btn[data-action-type="show_popup"][data-type="${map[COMMAND.EXIT]}"]`).first().click({ timeout: actionTimeout });

        await page.waitForTimeout(250); // wait
    
        await page.waitForSelector(`.btn[data-action-type="modal_yes"]`, { timeout: actionTimeout });
        await page.locator('.btn[data-action-type="modal_yes"]').first().click({ timeout: actionTimeout });

        console.log("EXIT SUCCESSFUL");
    } catch (e) {
        console.log(`Failed to Exit:`, e);
        // console.log(`Failed to Exit`);
    }
}

async function cycle(browser: Browser, page: Page, url: string, cmdFile: string) {
    if (!fs.existsSync(cmdFile)) {
        console.log("File doesnt exist, creating: ", cmdFile);
        fs.mkdirSync(path.dirname(cmdFile), { recursive: true });
        fs.writeFileSync(cmdFile, "", "utf8");
    }

    const cmd = (await fs.promises.readFile(cmdFile, "utf-8")).trim();

    let command: CommandVersion;
    try {
        command = JSON.parse(cmd);
    } catch {
        console.log("Invalid command file format:", cmd);
        command = { "version": 0, "command": COMMAND.CHECK } as CommandVersion;
        state.prevVersion = -1;
    }

    // If new command is different or last comman wasn't a valid command
    if (command?.command !== state.currCommand || !(Object.values(COMMAND) as string[]).includes(state.currCommand)) {
        state.currCommand = command?.command || COMMAND.CHECK;
    }
    
    if (command?.version <= state.prevVersion) {
        console.log(`Command version is the same`);
    } else {
        state.prevVersion = command.version;
    }

    console.log("Command read: " + command.command + " | Command DOING: " + state.currCommand);

    if (state.currCommand !== COMMAND.EXIT) {
        await refresh(page, url, botID); // Watch out for refresh button
        await stayActive(page); // Make sure the site knows the bot is "active"
        await buyBack(page); // Check if buy back is needed
    }

    switch (state.currCommand) {
        case COMMAND.FOLD:
            await fold(page);
            break;
        case COMMAND.CHECK:
            await checkOrFold(page);
            break;
        case COMMAND.CALL:
            await call(page, null);
            break;
        case COMMAND.ALL_IN:
            await allIn(page);
            break;
        case COMMAND.EXIT:
            await exit(page);
            await browser.close();
            return false;
        default:
            // Default to check (or fold)
            await checkOrFold(page);
    }

    return true;
}


async function main() {
    if (!targetUrl) {
        console.log(`Bad URL`);
        return;
    }

    let filePath = "";
    try {
        const botIDnum = Number(botID);
        if (!botID || botIDnum < 0) {
            console.log(`Bad Bot ID`);
            return;
        }
        filePath = path.resolve(
            process.env.HOME!,
            "GitHub/PokerBot",
            "bots",
            botID,
            "command.txt"
        );
    } catch (e) {
        console.log("Failed to build path with BotID: " + botID + ":", e);
    }

    if (!callThreshold || !Number(callThreshold)) {
        callThreshold = defaultCallThreshold;
    }

    console.log("**** CALL THRESHOLD SET:", callThreshold);


    const browser = await chromium.launch({ headless: headless });
    const page = await browser.newPage();

    await page.waitForTimeout(500); // wait

    while (!await login(page, targetUrl, botID)) {
        const wait = 1000;
        console.log(`Waiting ${wait/1000} second${wait/1000 === 1 ? '' : 's'} to try logging in again`);
        await new Promise(r => setTimeout(r, wait));
    }

    console.log(`Bot navigated to: ${targetUrl}`);

    const cmdFile = filePath;

    while (true) {
        const start = Date.now();
        if (await cycle(browser, page, targetUrl, cmdFile)) {
            const elapsed = Date.now() - start;
            const delay = Math.max(0, commandInterval - elapsed);
            await new Promise(res => setTimeout(res, delay));
        } else {
            return;
        }
    }
}

main();
