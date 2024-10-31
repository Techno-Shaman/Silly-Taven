import { Handlebars, moment, seedrandom, droll } from '../lib.js';
import { chat, chat_metadata, main_api, getMaxContextSize, getCurrentChatId, substituteParams } from '../script.js';
import { timestampToMoment, isDigitsOnly, getStringHash, escapeRegex, uuidv4 } from './utils.js';
import { textgenerationwebui_banned_in_macros } from './textgen-settings.js';
import { replaceInstructMacros } from './instruct-mode.js';
import { replaceVariableMacros } from './variables.js';

// Register any macro that you want to leave in the compiled story string
Handlebars.registerHelper('trim', () => '{{trim}}');
// Catch-all helper for any macro that is not defined for story strings
Handlebars.registerHelper('helperMissing', function () {
    const options = arguments[arguments.length - 1];
    const macroName = options.name;
    return substituteParams(`{{${macroName}}}`);
});

/**
 * @typedef {Object<string, *>} EnvObject
 * @typedef {(nonce: string) => string} MacroFunction
 */

export class MacrosParser {
    /**
     * A map of registered macros.
     * @type {Map<string, string|MacroFunction>}
     */
    static #macros = new Map();

    /**
     * Registers a global macro that can be used anywhere where substitution is allowed.
     * @param {string} key Macro name (key)
     * @param {string|MacroFunction} value A string or a function that returns a string
     */
    static registerMacro(key, value) {
        if (typeof key !== 'string') {
            throw new Error('Macro key must be a string');
        }

        // Allowing surrounding whitespace would just create more confusion...
        key = key.trim();

        if (!key) {
            throw new Error('Macro key must not be empty or whitespace only');
        }

        if (key.startsWith('{{') || key.endsWith('}}')) {
            throw new Error('Macro key must not include the surrounding braces');
        }

        if (typeof value !== 'string' && typeof value !== 'function') {
            console.warn(`Macro value for "${key}" will be converted to a string`);
            value = this.sanitizeMacroValue(value);
        }

        if (this.#macros.has(key)) {
            console.warn(`Macro ${key} is already registered`);
        }

        this.#macros.set(key, value);
    }

    /**
     * Unregisters a global macro with the given key
     *
     * @param {string} key Macro name (key)
     */
    static unregisterMacro(key) {
        if (typeof key !== 'string') {
            throw new Error('Macro key must be a string');
        }

        // Allowing surrounding whitespace would just create more confusion...
        key = key.trim();

        if (!key) {
            throw new Error('Macro key must not be empty or whitespace only');
        }

        const deleted = this.#macros.delete(key);

        if (!deleted) {
            console.warn(`Macro ${key} was not registered`);
        }
    }

    /**
     * Populate the env object with macro values from the current context.
     * @param {EnvObject} env Env object for the current evaluation context
     * @returns {void}
     */
    static populateEnv(env) {
        if (!env || typeof env !== 'object') {
            console.warn('Env object is not provided');
            return;
        }

        // No macros are registered
        if (this.#macros.size === 0) {
            return;
        }

        for (const [key, value] of this.#macros) {
            env[key] = value;
        }
    }

    /**
     * Performs a type-check on the macro value and returns a sanitized version of it.
     * @param {any} value Value returned by a macro
     * @returns {string} Sanitized value
     */
    static sanitizeMacroValue(value) {
        if (typeof value === 'string') {
            return value;
        }

        if (value === null || value === undefined) {
            return '';
        }

        if (value instanceof Promise) {
            console.warn('Promises are not supported as macro values');
            return '';
        }

        if (typeof value === 'function') {
            console.warn('Functions are not supported as macro values');
            return '';
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        if (typeof value === 'object') {
            return JSON.stringify(value);
        }

        return String(value);
    }
}

/**
 * Gets a hashed id of the current chat from the metadata.
 * If no metadata exists, creates a new hash and saves it.
 * @returns {number} The hashed chat id
 */
function getChatIdHash() {
    const cachedIdHash = chat_metadata['chat_id_hash'];

    // If chat_id_hash is not already set, calculate it
    if (!cachedIdHash) {
        // Use the main_chat if it's available, otherwise get the current chat ID
        const chatId = chat_metadata['main_chat'] ?? getCurrentChatId();
        const chatIdHash = getStringHash(chatId);
        chat_metadata['chat_id_hash'] = chatIdHash;
        return chatIdHash;
    }

    return cachedIdHash;
}

/**
 * Returns the ID of the last message in the chat
 *
 * Optionally can only choose specific messages, if a filter is provided.
 *
 * @param {object} param0 - Optional arguments
 * @param {boolean} [param0.exclude_swipe_in_propress=true] - Whether a message that is currently being swiped should be ignored
 * @param {function(object):boolean} [param0.filter] - A filter applied to the search, ignoring all messages that don't match the criteria. For example to only find user messages, etc.
 * @returns {number|null} The message id, or null if none was found
 */
export function getLastMessageId({ exclude_swipe_in_propress = true, filter = null } = {}) {
    for (let i = chat?.length - 1; i >= 0; i--) {
        let message = chat[i];

        // If ignoring swipes and the message is being swiped, continue
        // We can check if a message is being swiped by checking whether the current swipe id is not in the list of finished swipes yet
        if (exclude_swipe_in_propress && message.swipes && message.swipe_id >= message.swipes.length) {
            continue;
        }

        // Check if no filter is provided, or if the message passes the filter
        if (!filter || filter(message)) {
            return i;
        }
    }

    return null;
}

/**
 * Returns the ID of the first message included in the context
 *
 * @returns {number|null} The ID of the first message in the context
 */
function getFirstIncludedMessageId() {
    const index = Number(document.querySelector('.lastInContext')?.getAttribute('mesid'));

    if (!isNaN(index) && index >= 0) {
        return index;
    }

    return null;
}

/**
 * Returns the last message in the chat
 *
 * @returns {string} The last message in the chat
 */
function getLastMessage() {
    const mid = getLastMessageId();
    return chat[mid]?.mes ?? '';
}

/**
 * Returns the last message from the user
 *
 * @returns {string} The last message from the user
 */
function getLastUserMessage() {
    const mid = getLastMessageId({ filter: m => m.is_user && !m.is_system });
    return chat[mid]?.mes ?? '';
}

/**
 * Returns the last message from the bot
 *
 * @returns {string} The last message from the bot
 */
function getLastCharMessage() {
    const mid = getLastMessageId({ filter: m => !m.is_user && !m.is_system });
    return chat[mid]?.mes ?? '';
}

/**
 * Returns the 1-based ID (number) of the last swipe
 *
 * @returns {number|null} The 1-based ID of the last swipe
 */
function getLastSwipeId() {
    // For swipe macro, we are accepting using the message that is currently being swiped
    const mid = getLastMessageId({ exclude_swipe_in_propress: false });
    const swipes = chat[mid]?.swipes;
    return swipes?.length;
}

/**
 * Returns the 1-based ID (number) of the current swipe
 *
 * @returns {number|null} The 1-based ID of the current swipe
 */
function getCurrentSwipeId() {
    // For swipe macro, we are accepting using the message that is currently being swiped
    const mid = getLastMessageId({ exclude_swipe_in_propress: false });
    const swipeId = chat[mid]?.swipe_id;
    return swipeId !== null ? swipeId + 1 : null;
}

/**
 * Replaces banned words in macros with an empty string.
 * Adds them to textgenerationwebui ban list.
 * @param {string} inText Text to replace banned words in
 * @returns {string} Text without the "banned" macro
 */
function bannedWordsReplace(inText) {
    if (!inText) {
        return '';
    }

    const banPattern = /{{banned "(.*)"}}/gi;

    if (main_api == 'textgenerationwebui') {
        const bans = inText.matchAll(banPattern);
        if (bans) {
            for (const banCase of bans) {
                console.log('Found banned words in macros: ' + banCase[1]);
                textgenerationwebui_banned_in_macros.push(banCase[1]);
            }
        }
    }

    inText = inText.replaceAll(banPattern, '');
    return inText;
}

function getTimeSinceLastMessage() {
    const now = moment();

    if (Array.isArray(chat) && chat.length > 0) {
        let lastMessage;
        let takeNext = false;

        for (let i = chat.length - 1; i >= 0; i--) {
            const message = chat[i];

            if (message.is_system) {
                continue;
            }

            if (message.is_user && takeNext) {
                lastMessage = message;
                break;
            }

            takeNext = true;
        }

        if (lastMessage?.send_date) {
            const lastMessageDate = timestampToMoment(lastMessage.send_date);
            const duration = moment.duration(now.diff(lastMessageDate));
            return duration.humanize();
        }
    }

    return 'just now';
}

function randomReplace(input, emptyListPlaceholder = '', varEscape = (x => x)) {
    const randomPattern = /{{random\s?::?([^}]+)}}/gi;

    input = input.replace(randomPattern, (match, listString) => {
        // Split on either double colons or comma. If comma is the separator, we are also trimming all items.
        const list = listString.includes('::')
            ? listString.split('::')
            // Replaced escaped commas with a placeholder to avoid splitting on them
            : listString.replace(/\\,/g, '##�COMMA�##').split(',').map(item => item.trim().replace(/##�COMMA�##/g, ','));

        if (list.length === 0) {
            return emptyListPlaceholder;
        }
        const rng = seedrandom('added entropy.', { entropy: true });
        const randomIndex = Math.floor(rng() * list.length);
        return varEscape(list[randomIndex]);
    });
    return input;
}

function pickReplace(input, rawContent, emptyListPlaceholder = '', varEscape = (x => x)) {
    const pickPattern = /{{pick\s?::?([^}]+)}}/gi;

    // We need to have a consistent chat hash, otherwise we'll lose rolls on chat file rename or branch switches
    // No need to save metadata here - branching and renaming will implicitly do the save for us, and until then loading it like this is consistent
    const chatIdHash = getChatIdHash();
    const rawContentHash = getStringHash(rawContent);

    return input.replace(pickPattern, (match, listString, offset) => {
        // Split on either double colons or comma. If comma is the separator, we are also trimming all items.
        const list = listString.includes('::')
            ? listString.split('::')
            // Replaced escaped commas with a placeholder to avoid splitting on them
            : listString.replace(/\\,/g, '##�COMMA�##').split(',').map(item => item.trim().replace(/##�COMMA�##/g, ','));

        if (list.length === 0) {
            return emptyListPlaceholder;
        }

        // We build a hash seed based on: unique chat file, raw content, and the placement inside this content
        // This allows us to get unique but repeatable picks in nearly all cases
        const combinedSeedString = `${chatIdHash}-${rawContentHash}-${offset}`;
        const finalSeed = getStringHash(combinedSeedString);
        // @ts-ignore - have to use numbers for legacy picks
        const rng = seedrandom(finalSeed);
        const randomIndex = Math.floor(rng() * list.length);
        return varEscape(list[randomIndex]);
    });
}

function diceRollReplace(input, invalidRollPlaceholder = '', varEscape = (x => x)) {
    const rollPattern = /{{roll[ : ]([^}]+)}}/gi;

    return input.replace(rollPattern, (match, matchValue) => {
        let formula = matchValue.trim();

        if (isDigitsOnly(formula)) {
            formula = `1d${formula}`;
        }

        const isValid = droll.validate(formula);

        if (!isValid) {
            console.debug(`Invalid roll formula: ${formula}`);
            return invalidRollPlaceholder;
        }

        const result = droll.roll(formula);
        return varEscape(String(result.total));
    });
}

/**
 * Returns the difference between two times. Works with any time format acceptable by moment().
 * Can work with {{date}} {{time}} macros
 * @param {string} input - The string to replace time difference macros in.
 * @param {function} [varEscape] - Optional function for escaping the macro contents.
 * @returns {string} The string with replaced time difference macros.
 */
function timeDiffReplace(input, varEscape = (x => x)) {
    const timeDiffPattern = /{{timeDiff::(.*?)::(.*?)}}/gi;

    const output = input.replace(timeDiffPattern, (_match, matchPart1, matchPart2) => {
        const time1 = moment(matchPart1);
        const time2 = moment(matchPart2);

        const timeDifference = moment.duration(time1.diff(time2));
        return varEscape(timeDifference.humanize(true));
    });

    return output;
}

/**
 * Substitutes {{macro}} parameters in a string.
 * @param {string} content - The string to substitute parameters in.
 * @param {EnvObject} env - Map of macro names to the values they'll be substituted with. If the param
 * values are functions, those functions will be called and their return values are used.
 * @param {function} [varEscape] - Optional function that escapes macros before they're injected
 * @returns {string} The string with substituted parameters.
 */
export function evaluateMacros(content, env, varEscape = (x => x)) {
    if (!content) {
        return '';
    }

    const rawContent = content;

    // Legacy non-macro substitutions
    content = content.replace(/<USER>/gi, varEscape(typeof env.user === 'function' ? env.user() : env.user));
    content = content.replace(/<BOT>/gi, varEscape(typeof env.char === 'function' ? env.char() : env.char));
    content = content.replace(/<CHAR>/gi, varEscape(typeof env.char === 'function' ? env.char() : env.char));
    content = content.replace(/<CHARIFNOTGROUP>/gi, varEscape(typeof env.group === 'function' ? env.group() : env.group));
    content = content.replace(/<GROUP>/gi, varEscape(typeof env.group === 'function' ? env.group() : env.group));

    // Short circuit if there are no macros
    if (!content.includes('{{')) {
        return content;
    }

    content = diceRollReplace(content, varEscape);
    content = replaceInstructMacros(content, env, varEscape);
    content = replaceVariableMacros(content, varEscape);
    content = content.replace(/{{newline}}/gi, varEscape('\n'));
    content = content.replace(/(?:\r?\n)*{{trim}}(?:\r?\n)*/gi, '');
    content = content.replace(/{{noop}}/gi, '');
    content = content.replace(/{{input}}/gi, () => varEscape(String($('#send_textarea').val())));

    // Add all registered macros to the env object
    const nonce = uuidv4();
    MacrosParser.populateEnv(env);

    // Substitute passed-in variables
    for (const varName in env) {
        if (!Object.hasOwn(env, varName)) continue;

        content = content.replace(new RegExp(`{{${escapeRegex(varName)}}}`, 'gi'), () => {
            const param = env[varName];
            const value = MacrosParser.sanitizeMacroValue(typeof param === 'function' ? param(nonce) : param);
            return varEscape(value);
        });
    }

    content = content.replace(/{{maxPrompt}}/gi, () => varEscape(String(getMaxContextSize())));
    content = content.replace(/{{lastMessage}}/gi, () => varEscape(getLastMessage()));
    content = content.replace(/{{lastMessageId}}/gi, () => varEscape(String(getLastMessageId() ?? '')));
    content = content.replace(/{{lastUserMessage}}/gi, () => varEscape(getLastUserMessage()));
    content = content.replace(/{{lastCharMessage}}/gi, () => varEscape(getLastCharMessage()));
    content = content.replace(/{{firstIncludedMessageId}}/gi, () => varEscape(String(getFirstIncludedMessageId() ?? '')));
    content = content.replace(/{{lastSwipeId}}/gi, () => varEscape(String(getLastSwipeId() ?? '')));
    content = content.replace(/{{currentSwipeId}}/gi, () => varEscape(String(getCurrentSwipeId() ?? '')));
    content = content.replace(/{{reverse:(.+?)}}/gi, (_, str) => varEscape(Array.from(str).reverse().join('')));

    content = content.replace(/\{\{\/\/([\s\S]*?)\}\}/gm, '');

    content = content.replace(/{{time}}/gi, () => varEscape(moment().format('LT')));
    content = content.replace(/{{date}}/gi, () => varEscape(moment().format('LL')));
    content = content.replace(/{{weekday}}/gi, () => varEscape(moment().format('dddd')));
    content = content.replace(/{{isotime}}/gi, () => varEscape(moment().format('HH:mm')));
    content = content.replace(/{{isodate}}/gi, () => varEscape(moment().format('YYYY-MM-DD')));

    content = content.replace(/{{datetimeformat +([^}]*)}}/gi, (_, format) => {
        return varEscape(moment().format(format));
    });
    content = content.replace(/{{idle_duration}}/gi, () => getTimeSinceLastMessage());
    content = content.replace(/{{time_UTC([-+]\d+)}}/gi, (_, offset) => {
        const utcOffset = parseInt(offset, 10);
        return varEscape(moment().utc().utcOffset(utcOffset).format('LT'));
    });
    content = timeDiffReplace(content, varEscape);
    content = bannedWordsReplace(content);
    content = randomReplace(content, varEscape);
    content = pickReplace(content, rawContent, varEscape);
    return content;
}
