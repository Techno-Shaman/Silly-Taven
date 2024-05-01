// statsHelper.js
import { getRequestHeaders, callPopup, characters, this_chid, buildAvatarList, characterToEntity, getOneCharacter, getCharacter, user_avatar, personaToEntity } from '../script.js';
import { humanizeTimespan } from './RossAscends-mods.js';
import { getPersona } from './personas.js';
import { registerDebugFunction } from './power-user.js';
import { humanFileSize, humanizedDuration, parseJson, sensibleRound, smartTruncate } from './utils.js';


/** @typedef {import('../script.js').Character} Character */
/** @typedef {import('../../src/endpoints/stats.js').UserStatsCollection} UserStatsCollection */
/** @typedef {import('../../src/endpoints/stats.js').CharacterStats} CharacterStats */
/** @typedef {import('../../src/endpoints/stats.js').ChatStats} ChatStats */
/** @typedef {import('../../src/endpoints/stats.js').MessageStats} MessageStats */
/** @typedef {import('../../src/endpoints/stats.js').StatsRequestBody} StatsRequestBody */

/**
 * @typedef {object} AggregateStat
 * @property {number} count - The number of stats used for this aggregation - used for recalculating avg
 * @property {number} total - Total / Sum
 * @property {number} min - Minimum value
 * @property {number} max - Maximum value
 * @property {number} avg - Average value
 * @property {number[]} values - All values listed and saved, so the aggregate stats can be updated if needed when elements get removed
 * @property {number?} subCount - The number of stats used when this is aggregated over the totals of aggregated stats, meaning based on any amount of sub/inner values
 */

/**
 * @typedef {object} StatField A stat block value to print
 * @property {any} value - The value to print
 * @property {boolean} [isHeader=false] - Flag indicating whether this is a header
 * @property {string|null} [info=null] - Optional text that will be shown as an info icon
 * @property {string|'info'|null} [title=null] - Optional title for the value - if set to 'info', info will be used as title too
 * @property {string[]|null} [classes=null] - Optional list of classes for the stat field
 */

/**
 * @typedef {object} AggBuildOptions Blah
 * @property {string | {singular: string, plural: string}} [options.basedOn='chat'] -
 * @property {string | {singular: string, plural: string}} [options.basedOnSub='message'] -
 * @property {boolean} [options.excludeTotal=false] - Exclude
 * @property {((value: *) => string)} [options.transform=null] -
 */

/** @type {AggBuildOptions} */
const DEFAULT_AGG_BUILD_OPTIONS = { basedOn: 'chat', basedOnSub: 'message', excludeTotal: false, transform: null };

/**
 * Gets the fields for an aggregated value
 * @param {AggregateStat} agg -
 * @param {AggBuildOptions} [options=DEFAULT_AGG_BUILD_OPTIONS] -
 * @returns {StatField[]}
 */
function aggregateFields(agg, options = DEFAULT_AGG_BUILD_OPTIONS) {
    options = { ...DEFAULT_AGG_BUILD_OPTIONS, ...options };
    const basedOn = (typeof options.basedOn !== 'object' || options.basedOn === null) ? { singular: `${options.basedOn}`, plural: `${options.basedOn}s` } : options.basedOn;
    const basedOnSub = (typeof options.basedOnSub !== 'object' || options.basedOnSub === null) ? { singular: `${options.basedOnSub}`, plural: `${options.basedOnSub}s` } : options.basedOnSub;

    /** @param {*|number} val @param {string} name @returns {StatField} */
    const build = (val, name) => {
        // Apply transform and rounding
        let value = options.transform ? options.transform(val) : val;
        value = typeof value === 'number' ? sensibleRound(value) : value;

        // Build title tooltip
        let title = `${name}, based on ${agg.count} ${agg.count !== 1 ? basedOn.plural : basedOn.singular}`
        if (agg.subCount) title += ` and ${agg.subCount} ${agg.subCount !== 1 ? basedOnSub.plural : basedOnSub.singular}`;

        return { value: value, title: title };
    };
    return [options.excludeTotal ? null : build(agg.total, 'Total'), build(agg.min, 'Minimum'), build(agg.avg, 'Average'), build(agg.max, 'Maximum')];
}

/** Gets the stat field object for any value @param {StatField|any} x @returns {StatField} */
function statField(x) { return (typeof x === 'object' && x !== null && Object.hasOwn(x, 'value')) ? x : { value: x }; }

/**
 * Creates an HTML stat block
 *
 * @param {StatField|any} name - The name content of the stat to be displayed
 * @param {StatField[]|any[]} values - Value or values to be listed for the stat block
 * @returns {string} - An HTML string representing the stat block
 */
function createStatBlock(name, ...values) {
    /** @param {StatField} stat @returns {string} */
    function buildField(stat) {
        const classes = ['rm_stat_field', stat.isHeader ? 'rm_stat_header' : '', ...(stat.classes ?? [])].filter(x => x?.length);
        return `<div class="${classes.join(' ')}" ${stat.title ? `title="${stat.title === 'info' ? stat.info : stat.title}"` : ''}>
            ${stat.value === null || stat.value === '' ? '&zwnj;' : stat.value}
            ${stat.info ? `<small><div class="fa-solid fa-circle-info opacity50p" data-i18n="[title]${stat.info}" title="${stat.info}"></div></small>` : ''}
        </div>`;
    }

    const statName = statField(name);
    const statValues = values.flat(Infinity).map(statField);

    const isDataRow = !statName.isHeader && !statValues.some(x => x.isHeader);
    const isRightSpacing = statValues.slice(-1)[0]?.classes?.includes('rm_stat_right_spacing');
    // Hack right spacing, which is added via a value just having the class
    if (isRightSpacing) {
        statValues.pop();
    }

    const classes = ['rm_stat_block', isDataRow ? 'rm_stat_block_data_row' : null, isRightSpacing ? 'rm_stat_right_spacing' : null].filter(x => x?.length);
    return `<div class="${classes.join(' ')}">
                <div class="rm_stat_name">${buildField(statName)}</div>
                <div class="rm_stat_values">${statValues.map(x => buildField(x)).join('')}</div>
            </div>`;
}

/**
 * Show the stats popup for a given stats report
 * @param {string} html - The html report that should be shown in the popup
 */
function showStatsPopup(html) {
    callPopup(html, 'text', '', { wider: true, allowVerticalScrolling: true });
}

/**
 * Generates an HTML report of stats.
 *
 * This function creates an HTML report from the provided stats, including chat age,
 * chat time, number of user messages and character messages, word count, and swipe count.
 * The stat blocks are tailored depending on the stats type ("User" or "Character").
 *
 * @param {'user'|'character'} statsType - The type of stats (e.g., "User", "Character")
 * @param {CharacterStats} stats - The stats data
 * @returns {string} The html
 */
function createCharStatsHtml(statsType, stats) {
    const NOW = Date.now();
    const isChar = statsType === 'character';

    const HMTL_STAT_SPACER = '<div class="rm_stat_spacer"></div>';
    const VAL_RIGHT_SPACING = { value: null, classes: ['rm_stat_right_spacing'] };
    const BASED_ON_MES_PLUS_SWIPE = { singular: 'message and its swipes', plural: 'messages and their swipes' };
    const HOVER_TOOLTIP_SUFFIX = '\n\nHover over any value to see what it is based on.';
    const GEN_TOKEN_WARNING = '(Token count is only correct, if setting \'Message Token Count\' was turned on during generation)';

    // some pre calculations
    const mostUsedModel = findHighestModel(stats.genModels);
    const charactersCount = !isChar ? (new Set(stats.chatsStats.map(x => x.charName))).size : null;

    let subHeader = (() => {
        switch (statsType) {
            case 'character': return `Overall character stats based on all chats for ${stats.charName}`;
            case 'user': return `Global stats based on all chats of ${charactersCount} characters`;
            default: return '';
        };
    })();

    // Create popup HTML with stats
    let html = `<h3 class="rm_stat_popup_header">${isChar ? 'Character' : 'User'} Stats - ${isChar ? stats.charName : stats.userName}</h3>`;
    html += `<small>${subHeader}</small>`;

    // Overview
    html += HMTL_STAT_SPACER;
    html += createStatBlock({ value: isChar ? 'Character Overview' : 'Overview', isHeader: true });
    html += createStatBlock({ value: 'Chats', info: `The number of existing chats with ${stats.charName}.\nFor the sake of statistics, Branches count as chats and all their messages will be included.` },
        stats.chats, VAL_RIGHT_SPACING);
    html += createStatBlock({ value: 'File Size', info: 'The chat file sizes on disk calculated and summed.\nThis value might not represent the exact same value your operating system uses.' },
        humanFileSize(stats.chatSize), VAL_RIGHT_SPACING);
    html += createStatBlock({ value: 'Most Used Model', info: 'Most used model for generations, both messages and swipes.\n(Does not include internal generation commands like /gen or /impersonate)\n\nHover over the value to see the numbers behind.' },
        { value: smartTruncate(mostUsedModel.model, 32), title: 'info', info: `${mostUsedModel.model}\nUsed ${mostUsedModel.count} times to generate ${mostUsedModel.tokens} tokens\n\n${GEN_TOKEN_WARNING}` }, VAL_RIGHT_SPACING);

    html += HMTL_STAT_SPACER;
    html += createStatBlock('',
        { value: 'First', isHeader: true, info: `Data corresponding to the first chat with ${stats.charName}`, title: 'info' },
        { value: 'Last', isHeader: true, info: `Data corresponding to the last chat with ${stats.charName}`, title: 'info' },
        VAL_RIGHT_SPACING,
    );
    html += createStatBlock({ value: 'New Chat', info: 'The first/last time when a new chat was started.' },
        { value: humanizedDuration(stats.firstCreateDate, NOW, { wrapper: x => `${x} ago` }), title: stats.firstCreateDate },
        { value: humanizedDuration(stats.lastCreateDate, NOW, { wrapper: x => `${x} ago` }), title: stats.lastCreateDate },
        VAL_RIGHT_SPACING,
    );
    html += createStatBlock({ value: 'Chat Ended', info: 'The first/last time when the last message was send to a chat.' },
        { value: humanizedDuration(stats.firstlastInteractionDate, NOW, { wrapper: x => `${x} ago` }), title: stats.firstlastInteractionDate },
        { value: humanizedDuration(stats.lastLastInteractionDate, NOW, { wrapper: x => `${x} ago` }), title: stats.lastLastInteractionDate },
        VAL_RIGHT_SPACING,
    );

    // Aggregated Stats
    html += HMTL_STAT_SPACER;
    html += HMTL_STAT_SPACER;
    html += createStatBlock({ value: 'Aggregated Stats', isHeader: true, info: 'Values per chat, aggregated over all chats\n\n • Total: Total summed value over all chats\n • Min: Minium value for any chat\n • Avg: Average value over all chats\n • Max: Maximum value for any chat' });
    html += createStatBlock(null,
        { value: 'Total', isHeader: true, info: 'Total summed value over all chats', title: 'info' },
        { value: 'Min', isHeader: true, info: 'Minium value for any chat', title: 'info' },
        { value: 'Avg', isHeader: true, info: 'Average value over all chats', title: 'info' },
        { value: 'Max', isHeader: true, info: 'Maximum value for any chat', title: 'info' }
    );
    html += createStatBlock({ value: 'Chatting Time', info: 'Chatting time per chat\nCalculated based on chat creation and the last interaction in that chat.' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.chattingTime, { transform: time => humanizeTimespan(time, { short: true }) }));
    html += createStatBlock({ value: 'Generation Time', info: 'Generation time per chat\nSummed generation times of all messages and swipes.' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.genTime, { basedOnSub: BASED_ON_MES_PLUS_SWIPE, transform: time => humanizeTimespan(time, { short: true }) }));
    html += createStatBlock({ value: 'Generated Tokens', info: `Generated tokens per chat\nSummed token counts of all messages and swipes.\n${GEN_TOKEN_WARNING}` + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.genTokenCount, { basedOnSub: BASED_ON_MES_PLUS_SWIPE }));
    html += HMTL_STAT_SPACER;
    html += createStatBlock({ value: 'Swiping Time', info: 'Swiping time per chat\nSummed time spend on generation alternative swipes. Excludes the final message that was chosen to continue the chat.' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.swipeGenTime, { basedOnSub: BASED_ON_MES_PLUS_SWIPE, transform: time => humanizeTimespan(time, { short: true }) }));
    html += createStatBlock({ value: 'Swipes', info: 'Swipes per chat\nCounts all generated messages/swipes that were not chosen to continue the chat.' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.swipes, { basedOnSub: BASED_ON_MES_PLUS_SWIPE }));
    html += HMTL_STAT_SPACER;
    html += createStatBlock({ value: 'User Response Time', info: 'User response time per chat\nCalculated based on the time between the last action of the message before and the next user message.\nAs \'action\' counts both the message send time and when the last generation of it ended, even if that swipe wasn\'t chosen.' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.userResponseTime, { transform: time => humanizeTimespan(time, { short: true }) }));
    html += HMTL_STAT_SPACER;
    html += createStatBlock({ value: 'Messages', info: 'Messages per chat (excluding swipes)' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.messages));
    html += createStatBlock({ value: 'System Messages', info: 'Sytem messages per chat' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.systemMessages));
    html += createStatBlock({ value: 'Messages (User / Char)', classes: ['rm_stat_field_smaller'], info: 'Messages per chat (excluding swipes)\nSplit into user and character, and showing a bar graph with percentages.' + HOVER_TOOLTIP_SUFFIX },
        ...buildBarDescsFromAggregates(stats.userMessages, stats.charMessages));
    html += createStatBlock({ value: '', info: '' },
        ...buildBarsFromAggregates(stats.userMessages, stats.charMessages));
    html += HMTL_STAT_SPACER;
    html += createStatBlock({ value: 'Words', info: 'Word count per chat (excluding swipes)' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.words));
    html += createStatBlock({ value: 'Words (User / Char)', classes: ['rm_stat_field_smaller'], info: 'Word count per chat (excluding swipes)\nSplit into user and character, and showing a bar graph with percentages.' + HOVER_TOOLTIP_SUFFIX },
        ...buildBarDescsFromAggregates(stats.userWords, stats.charWords));
    html += createStatBlock({ value: '', info: '' },
        ...buildBarsFromAggregates(stats.userWords, stats.charWords));

    // Per Message Stats
    html += HMTL_STAT_SPACER;
    html += HMTL_STAT_SPACER;
    html += createStatBlock({ value: 'Per Message Stats', isHeader: true, info: 'Values per message, aggregated over all chats\n\n • Min: Minium value for any message\n • Avg: Average value over all messages\n • Max: Maximum value for any message' });
    html += createStatBlock('',
        null,
        { value: 'Min', isHeader: true, info: 'Minium value for any message', title: 'info' },
        { value: 'Avg', isHeader: true, info: 'Average value over all messages', title: 'info' },
        { value: 'Max', isHeader: true, info: 'Maximum value for any message', title: 'info' }
    );
    html += createStatBlock({ value: 'Generation Time', info: 'Generation time per message\nSummed generation times of the message and all swipes.' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.perMessageGenTime, { basedOn: BASED_ON_MES_PLUS_SWIPE, excludeTotal: true, transform: time => humanizeTimespan(time, { short: true }) }));
    html += createStatBlock({ value: 'Generated Tokens', info: `Generated tokens per message\nSummed token counts of the message and all swipes.\n${GEN_TOKEN_WARNING}` + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.perMessageGenTokenCount, { basedOn: BASED_ON_MES_PLUS_SWIPE, excludeTotal: true }));
    html += HMTL_STAT_SPACER;
    html += createStatBlock({ value: 'Swiping Time', info: 'Swiping time per message\nSummed time spend on generation alternative swipes. Excludes the final message that was chosen to continue the chat.' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.perMessageSwipeGenTime, { basedOn: BASED_ON_MES_PLUS_SWIPE, excludeTotal: true, transform: time => humanizeTimespan(time, { short: true }) }));
    html += createStatBlock({ value: 'Swipes', info: 'Swipes per message\nCounts all generated messages/swipes that were not chosen to continue the chat.' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.perMessageSwipeCount, { basedOn: BASED_ON_MES_PLUS_SWIPE, excludeTotal: true }));
    html += HMTL_STAT_SPACER;
    html += createStatBlock({ value: 'User Response Time', info: 'User response time per message\nCalculated based on the time between the last action of the message before and the next user message.\nAs \'action\' counts both the message send time and when the last generation of it ended, even if that swipe wasn\'t chosen.' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.perMessageUserResponseTime, { basedOn: 'message', excludeTotal: true, transform: time => humanizeTimespan(time, { short: true }) }));
    html += HMTL_STAT_SPACER;
    html += createStatBlock({ value: 'Words', info: 'Word count per message (excluding swipes)' + HOVER_TOOLTIP_SUFFIX },
        ...aggregateFields(stats.perMessageWords, { basedOn: 'message', excludeTotal: true }));
    html += createStatBlock({ value: 'Words (User / Char)', classes: ['rm_stat_field_smaller'], info: 'Word count per message (excluding swipes)\nSplit into user and character, and showing a bar graph with percentages.' + HOVER_TOOLTIP_SUFFIX },
        ...buildBarDescsFromAggregates(stats.perMessageUserWords, stats.perMessageCharWords, { basedOn: 'message', excludeTotal: true }));
    html += createStatBlock({ value: '', info: '' },
        ...buildBarsFromAggregates(stats.perMessageUserWords, stats.perMessageCharWords, { basedOn: 'message', excludeTotal: true }));

    html += HMTL_STAT_SPACER;
    html += HMTL_STAT_SPACER;

    // Hijack avatar list function to draw the user avatar
    let entity = null;
    switch (statsType) {
        case 'character':
            const character = getCharacter(stats.characterKey);
            const cid = characters.indexOf(x => x === character);
            entity = characterToEntity(character, cid);
            break;
        case 'user':
            const persona = getPersona(user_avatar);
            entity = personaToEntity(persona);
            break;
    }
    if (entity) {
        const placeHolder = $('<div class="rm_stat_avatar_block"></div>');
        buildAvatarList(placeHolder, [entity]);
        html = placeHolder.prop('outerHTML') + html;
    }

    return html;

    /** @param {AggregateStat} agg1 @param {AggregateStat} agg2 @param {AggBuildOptions} options @returns {StatField[]}  */
    function buildBarsFromAggregates(agg1, agg2, options = DEFAULT_AGG_BUILD_OPTIONS) {
        options = { ...DEFAULT_AGG_BUILD_OPTIONS, ...options };
        const f1 = aggregateFields(agg1, options);
        const f2 = aggregateFields(agg2, options);
        const bars = f1.map((_, i) => buildBar(f1[i]?.value, f2[i]?.value));
        return bars.map(statField);
    }
    /** @param {number} charVal @param {number} userVal @returns {string}  */
    function buildBar(userVal, charVal) {
        const percentUser = (userVal / (userVal + charVal)) * 100;
        const percentChar = 100 - percentUser;
        return `<div class="rm_stat_bar">
            <div style="width: ${percentUser}%" title="${stats.userName}: ${userVal}   (${percentUser.toFixed(1)}%)" class="rm_stat_bar_user"></div>
            <div style="width: ${percentChar}%" title="${stats.charName}: ${charVal}   (${percentChar.toFixed(1)}%)" class="rm_stat_bar_char"></div>
        </div>`;
    }
    /** @param {AggregateStat} agg1 @param {AggregateStat} agg2 @param {AggBuildOptions} options @returns {StatField[]}  */
    function buildBarDescsFromAggregates(agg1, agg2, options = DEFAULT_AGG_BUILD_OPTIONS) {
        options = { ...DEFAULT_AGG_BUILD_OPTIONS, ...options };
        const f1 = aggregateFields(agg1, options);
        const f2 = aggregateFields(agg2, options);
        const values = [f1[0], f2[0], f1[1], f2[1], f1[2], f2[2], f1[3], f2[3]];
        return buildBarDescs(values);
    }
    /** @param {any[]} values @returns {StatField[]}  */
    function buildBarDescs(...values) {
        return values.flat(Infinity).map(statField).map((x, i) => i % 2 == 0 ? { classes: [...(x.classes ?? []), 'rm_stat_field_lefty'], ...x } : x);
    }
}

/**
 * Finds the model with the highest count and returns its name and values
 *
 * @param {{[model: string]: { count: number, tokens: number }}} genModels - Object containing model usages
 * @returns {{ model: string, count: number, tokens: number }} - Object containing the name and values of the model with the highest count
 */
function findHighestModel(genModels) {
    return Object.entries(genModels).reduce((acc, [model, values]) => {
        return values.count > acc.count ? { model: model, count: values.count, tokens: values.tokens } : acc;
    }, { model: '<None>', count: 0, tokens: 0 });
}

/**
 * Handles the user stats by getting them from the server, calculating the total and generating the HTML report.
 */
export async function showUserStatsPopup() {
    // Get stats from server
    const globalStats = await getGlobalStats();

    // Create HTML with stats
    const html = createCharStatsHtml('user', globalStats);
    showStatsPopup(html);
}

/**
 * Handles the character stats by getting them from the server and generating the HTML report.
 *
 * @param {string} characterKey - The character key.
 */
export async function showCharacterStatsPopup(characterKey) {
    // Get stats from server
    const charStats = await getCharStats(characterKey);
    if (charStats === null) {
        toastr.info('No stats exist for the the current character.');
        return;
    }

    // Create HTML with stats
    const html = createCharStatsHtml('character', charStats);
    showStatsPopup(html);
}


/**
 *
 * @param {string} characterKey - The key of the character
 * @returns {Promise<CharacterStats?>}
 */
async function getCharStats(characterKey) {
    const stats = await callGetStats({ characterKey: characterKey });
    return stats;
}

/**
 *
 * @returns {Promise<CharacterStats>}
 */
async function getGlobalStats() {
    const stats = await callGetStats({ global: true });
    return stats;
}
/**
 *
 * @returns {Promise<UserStatsCollection?>}
 */
async function getFullStatsCollection() {
    const stats = await callGetStats();
    return stats;
}

/**
 * Fetches the character stats from the server.
 * For retrieving, use the more specific functions `getCharStats`, `getGlobalStats` and `getFullStatsCollection`.
 * @param {StatsRequestBody} [params={}] Optional parameter for the get request
 * @returns {Promise<object?>} character stats the full stats collection, depending on what was requested
 */
async function callGetStats(params = {}) {
    const response = await fetch('/api/stats/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(params),
        cache: 'no-cache',
    });

    if (!response.ok) {
        toastr.error('Stats could not be loaded. Try reloading the page.');
        throw new Error('Error getting stats');
    }

    // To use the custom JSON parser, we need to retrieve the body as text first
    const bodyText = await response.text();
    const stats = parseJson(bodyText);
    return stats;
}

/**
 * Asynchronously recreates the stats file from chat files.
 *
 * Sends a POST request to the "/api/stats/recreate" endpoint. If the request fails,
 * it displays an error notification and throws an error.
 *
 * @throws {Error} If the request to recreate stats is unsuccessful.
 */
async function recreateStats() {
    const response = await fetch('/api/stats/recreate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
        cache: 'no-cache',
    });

    if (!response.ok) {
        toastr.error('Stats could not be loaded. Try reloading the page.');
        throw new Error('Error getting stats');
    }
    else {
        toastr.success('Stats file recreated successfully!');
    }
}

export function initStats() {
    $('.rm_stats_button').on('click', async function () {
        await showCharacterStatsPopup(characters[this_chid].avatar);
    });
    $('.user_stats_button').on('click', async function () {
        await showUserStatsPopup();
    });
    // Wait for debug functions to load, then add the refresh stats function
    registerDebugFunction('refreshStats', 'Refresh Stat File', 'Recreates the stats file based on existing chat files', recreateStats);
}
