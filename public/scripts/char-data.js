/**
 * @typedef {object} v2DataWorldInfoEntry
 * @property {string[]} keys - An array of primary keys associated with the entry.
 * @property {string[]} secondary_keys - An array of secondary keys associated with the entry (optional).
 * @property {string} comment - A human-readable description or explanation for the entry.
 * @property {string} content - The main content or data associated with the entry.
 * @property {boolean} constant - Indicates if the entry's content is fixed and unchangeable.
 * @property {boolean} selective - Indicates if the entry's inclusion is controlled by specific conditions.
 * @property {number} insertion_order - Defines the order in which the entry is inserted during processing.
 * @property {boolean} enabled - Controls whether the entry is currently active and used.
 * @property {string} position - Specifies the location or context where the entry applies.
 * @property {v2DataWorldInfoEntryExtensionInfos} extensions - An object containing additional details for extensions associated with the entry.
 * @property {number} id - A unique identifier assigned to the entry.
 */
/**
 * @typedef {object} v2DataWorldInfoEntryExtensionInfos
 * @property {number} position - The order in which the extension is applied relative to other extensions.
 * @property {boolean} exclude_recursion - Prevents the extension from being applied recursively.
 * @property {number} probability - The chance (between 0 and 1) of the extension being applied.
 * @property {boolean} useProbability - Determines if the `probability` property is used.
 * @property {number} depth - The maximum level of nesting allowed for recursive application of the extension.
 * @property {number} selectiveLogic - Defines the logic used to determine if the extension is applied selectively.
 * @property {string} group - A category or grouping for the extension.
 * @property {boolean} group_override - Overrides any existing group assignment for the extension.
 * @property {number} group_weight - A value used for prioritizing extensions within the same group.
 * @property {boolean} prevent_recursion - Completely disallows recursive application of the extension.
 * @property {boolean} delay_until_recursion - Will only be checked during recursion.
 * @property {number} scan_depth - The maximum depth to search for matches when applying the extension.
 * @property {boolean} match_whole_words - Specifies if only entire words should be matched during extension application.
 * @property {boolean} use_group_scoring - Indicates if group weight is considered when selecting extensions.
 * @property {boolean} case_sensitive - Controls whether case sensitivity is applied during matching for the extension.
 * @property {string} automation_id - An identifier used for automation purposes related to the extension.
 * @property {number} role - The specific function or purpose of the extension.
 * @property {boolean} vectorized - Indicates if the extension is optimized for vectorized processing.
 * @property {number} display_index - The order in which the extension should be displayed for user interfaces.
 */

/**
 * @typedef {object} v2WorldInfoBook
 * @property {string} name - the name of the book
 * @property {v2DataWorldInfoEntry[]} entries - the entries of the book
 */

/**
 * @typedef {object} v2CharData
 * @property {string} name - The character's name.
 * @property {string} description - A brief description of the character.
 * @property {string} character_version - The character's data version.
 * @property {string} personality - A short summary of the character's personality traits.
 * @property {string} scenario - A description of the character's background or setting.
 * @property {string} first_mes - The character's opening message in a conversation.
 * @property {string} mes_example - An example message demonstrating the character's conversation style.
 * @property {string} creator_notes - Internal notes or comments left by the character's creator.
 * @property {string[]} tags - A list of keywords or labels associated with the character.
 * @property {string} system_prompt - The system prompt used to interact with the character.
 * @property {string} post_history_instructions - Instructions for handling the character's conversation history.
 * @property {string} creator - The name of the person who created the character.
 * @property {string[]} alternate_greetings - Additional greeting messages the character can use.
 * @property {v2WorldInfoBook} character_book - Data about the character's world or story (if applicable).
 * @property {v2CharDataExtensionInfos} extensions - Additional details specific to the character.
 */
/**
 * @typedef {object} v2CharDataExtensionInfos
 * @property {number} talkativeness - A numerical value indicating the character's propensity to talk.
 * @property {boolean} fav - A flag indicating whether the character is a favorite.
 * @property {string} world - The fictional world or setting where the character exists (if applicable).
 * @property {object} depth_prompt - Prompts used to explore the character's depth and complexity.
 * @property {number} depth_prompt.depth - The level of detail or nuance targeted by the prompt.
 * @property {string} depth_prompt.prompt - The actual prompt text used for deeper character interaction.
 * @property {"system" | "user" | "assistant"} depth_prompt.role - The role the character takes on during the prompted interaction (system, user, or assistant).
 * @property {RegexScriptData[]} regex_scripts - Custom regex scripts for the character.
 * // Non-standard extensions added by external tools
 * @property {string} [pygmalion_id] - The unique identifier assigned to the character by the Pygmalion.chat.
 * @property {string} [github_repo] - The gitHub repository associated with the character.
 * @property {string} [source_url] - The source URL associated with the character.
 * @property {{full_path: string}} [chub] - The Chub-specific data associated with the character.
 * @property {{source: string[]}} [risuai] - The RisuAI-specific data associated with the character.
 */

/**
* @typedef {object} RegexScriptData
* @property {string} id - UUID of the script
* @property {string} scriptName - The name of the script
* @property {string} findRegex - The regex to find
* @property {string} replaceString - The string to replace
* @property {string[]} trimStrings - The strings to trim
* @property {number[]} placement - The placement of the script
* @property {boolean} disabled - Whether the script is disabled
* @property {boolean} markdownOnly - Whether the script only applies to Markdown
* @property {boolean} promptOnly - Whether the script only applies to prompts
* @property {boolean} runOnEdit - Whether the script runs on edit
* @property {boolean} substituteRegex - Whether the regex should be substituted
* @property {number} minDepth - The minimum depth
* @property {number} maxDepth - The maximum depth
*/

/**
 * @typedef {object} v1CharData
 * @property {string} name - the name of the character
 * @property {string} description - the description of the character
 * @property {string} personality - a short personality description of the character
 * @property {string} scenario - a scenario description of the character
 * @property {string} first_mes - the first message in the conversation
 * @property {string} mes_example - the example message in the conversation
 * @property {string} creatorcomment - creator's notes of the character
 * @property {string[]} tags - the tags of the character
 * @property {number} talkativeness - talkativeness
 * @property {boolean|string} fav - fav
 * @property {string} create_date - create_date
 * @property {v2CharData} data - v2 data extension
 * // Non-standard extensions added by the ST server (not part of the original data)
 * @property {string} chat - name of the current chat file chat
 * @property {string} avatar - file name of the avatar image (acts as a unique identifier)
 * @property {string} json_data - the full raw JSON data of the character
 */

/** 
 * @typedef {object} PromV3CharBookEntry
 * @property {string} name - The name of the entry.
 * @property {string[]} keys - An array of primary keys associated with the entry.
 * @property {string[]} secondary_keys - An array of secondary keys associated with the entry.
 * @property {string} content - The main content or data associated with the entry.
 * @property {boolean} constant - Indicates if the entry's content is fixed and unchangeable.
 * @property {boolean} selective - Indicates if the entry's inclusion is controlled by specific conditions.
 * @property {boolean} enabled - Controls whether the entry is currently active and used.
 * @property {number} insertion_order - Defines the order in which the entry is inserted during processing.
 * @property {boolean} case_sensitive - Controls whether case sensitivity is applied during matching for the entry.
 * @property {boolean} use_regex - Specifies if the entry uses regular expressions for matching.
 * @property {number} priority - The priority level of the entry.
 * @property {number} id - A unique identifier assigned to the entry.
 * @property {string} comment - A human-readable description or explanation for the entry.
 * @property {string} position - Specifies the location or context where the entry applies.
 * @property {v2DataWorldInfoEntryExtensionInfos} extensions - An object containing additional details for extensions associated with the entry.
 */

/**
 * @typedef {object} PromV3CharBookData
 * @property {string} type - The type of book (e.g., "chara_book").
 * @property {string} spec_version - The specification version (e.g., "2.0").
 * @property {string} name - The name of the book.
 * @property {string} description - A brief description of the book.
 * @property {number} scan_depth - The maximum depth to search for matches when applying the book.
 * @property {number} token_budget - The maximum number of tokens that can be consumed by the book.
 * @property {boolean} recursive_scanning - Indicates if the book should be applied recursively.
 * @property {v2DataWorldInfoEntryExtensionInfos} extensions - Additional details specific to the book.
 * @property {PromV3CharBookEntry[]} entries - The entries in the book.

/**
 * @typedef {object} PromV3CharGreetings
 * @property {string[]} solo - Greetings used for solo interactions.
 * @property {string[]} group - Greetings used for group chats.
 */

/**
 * @typedef {object} PromV3CharExampleMessages
 * @property {"user" | "assistant" | "system"} role - The role of the speaker (user, assistant, or system).
 * @property {string} content - The message content.
 */

/**
 * @typedef {object} PromV3CharData
 * @property {string} name - The character's name.
 * @property {string} description - A brief description of the character.
 * @property {string} personality - A short summary of the character's personality traits.
 * @property {PromV3CharGreetings} greetings - Greetings used by the character.
 * @property {PromV3CharExampleMessages[]} example_messages - Example messages that demonstrate conversation styles.
 * @property {string} system_prompt - The system prompt used to interact with the character.
 * @property {string} post_history_instructions - Instructions for handling the character's conversation history.
 * @property {v2CharDataExtensionInfos} extensions - Additional details specific to the character.
 * @property {PromV3CharBookData} character_book - Data about the character's world or story (if applicable).
 */

/**
 * @typedef {object} PromV3Metadata
 * @property {string} creator - The name of the person who created the character.
 * @property {string} version - The character's data version.
 * @property {string} source - The source material or inspiration for the character.
 * @property {string[]} tags - A list of keywords or labels associated with the character.
 * @property {string} creator_notes - Internal notes or comments left by the character's creator.

/**
 * @typedef {object} PromV3Data
 * @property {string} type - The data type (e.g., chara_card).
 * @property {string} spec_version - The specification version (e.g., 3.1).
 * @property {PromV3CharData} data - The character data.
 * @property {PromV3Metadata} metadata - Additional metadata associated with the character.
 */

export default 0;// now this file is a module
