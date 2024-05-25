// reddit bot for r/ethtrader
const snoowrap = require('snoowrap');
const fetch = require('node-fetch');
const jsonfile = require('jsonfile');

var client = jsonfile.readFileSync('./.client');
var cache = require('./cache.json');
var log = require('./log.json');

var userUrl = "https://raw.githubusercontent.com/EthTrader/donut.distribution/main/docs/users.json";

var userScores = {}; // Move userScores here to make it global

async function fetchUsers() {
    try {
        console.log("Fetching user data from GitHub");
        const response = await fetch(userUrl);
        const users = await response.json();
        return users;
    } catch (err) {
        console.error("Failed to fetch user data:", err);
        return [];
    }
}

var r = new snoowrap({
    userAgent: client.userAgent,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    username: client.username,
    password: client.password
});

var subreddit = r.getSubreddit('ethtrader');

// set local timezone to utc
process.env.TZ = 'UTC';

// sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

remove_phrase = "[automodremove]";
approve_phrase = "[automodapprove]";

// check if cli argument is "--reset"
if (process.argv.includes("--reset")) {
    cache.seenIds = [];
    jsonfile.writeFileSync('./cache.json', cache);
    console.log("Cache reset");
}

async function main() {
    try {
        const users = await fetchUsers();
        users.forEach(user => {
            userScores[user.username] = user.weight;
        });

        foundLast = 0;
        foundNewest = 0;
        runOnce = 0;
        newSeens = 0;

        if (!cache.seenIds) {
            cache.seenIds = [];
        }
        if (cache.seenIds.length === 0) {
            params = { limit: 100 };
            runOnce = 1;
        } else {
            l = 1;
            lastSeenId = cache.seenIds[cache.seenIds.length - l];
            body = await r.getComment(lastSeenId).body;
            while (body === undefined || body === "[deleted]") {
                console.log("last comment deleted " + lastSeenId)
                l++;
                lastSeenId = cache.seenIds[cache.seenIds.length - l];
                body = await r.getComment(lastSeenId).body;
            }
            lastSeen = await r.getComment(lastSeenId);
            link = await lastSeen.link_id;
            console.log("Last seen comment " + lastSeenId + " " + body + " " + link);
            params = { limit: 100, before: lastSeenId };
        }
        while (!foundLast && !foundNewest) {
            timeString = new Date().toLocaleTimeString();
            console.log("Checking for new comments " + timeString);
            foundComment = 0;
            if (params.limit === 500) {
                before = 1;
            } else {
                before = 0;
            }
            await subreddit.getNewComments(params).then(async function (comments) {
                // reverse comments so we can start from the oldest
                comments.reverse();
                for (let comment of comments) {
                    if (!comment || !comment.body || comment.body === "[deleted]") continue;
                    // check if we've already seen this comment
                    if (!cache.seenIds.includes(comment.name)) {
		        const normalizedBody = comment.body.trim().toLowerCase().replace(/\\\[/g, '[').replace(/\\\]/g, ']');
                        console.log("Processing normalized comment body: " + normalizedBody); // Log the normalized comment body
                        if (normalizedBody.startsWith(remove_phrase)) {
			    console.log("Found automod remove phrase in comment: " + comment.body);
                            await handleReport(comment, userScores);
                        }
                        cache.seenIds.push(comment.name);
                        newSeens = 1;
                    } else {
                        foundLast = 1;
                    }
                }
                if (!foundComment) {
                    // check last comment timestamp
                    getComm = await r.getComment(lastSeenId).created_utc;
                    // current utc time
                    now = Math.floor(Date.now() / 1000);
                    // if last comment is older than 1 hour, check for new comments
                    if (now - getComm > 3600) {
                        console.log("Last comment older than 1 hour, checking for new comments from newest");
                        params = { limit: 500 };
                        foundComment = 1;
                    } else {
                        foundLast = 1;
                        foundNewest = 1;
                    }
                } else {
                    foundNewest = 1;
                    foundLast = 1;
                }
            });
            await sleep(500); // being nice to APIs
        }
    } catch (err) {
        console.error(err);
    }
    if (newSeens) {
        jsonfile.writeFileSync('./cache.json', cache);
    }
}

async function firstRun() {
    // check if first or second arg is "--skip"
    if (process.argv.includes("--skip")) {
        await main();
        return;
    }
    await main();
}

firstRun();

// run main function every 60 seconds
setInterval(main, 60000);


async function handleReport(comment) {
    console.log(comment);
    author = await comment.author.name;
    if(userScores[author] == undefined) {
        // console.log("   User does not have enough voting power");
    } else if(userScores[author] > 20000) {
        if(comment.link_id != comment.parent_id) {
            //console.log("Checking comment to be removed");
            toRemove = await r.getComment(comment.parent_id);
            console.log("Found request from "+author);
            link = await toRemove.permalink;
            console.log("   Reported link: https://www.reddit.com"+link);
            isRemoved = await toRemove.removed;
            if(isRemoved) {
                console.log("   Comment already removed");
                return;
            }
            offendingUser = await toRemove.author.name;
            console.log("   Reported user: "+offendingUser);
            // check for previous mod reports
            reports = await toRemove.mod_reports;
            for(i in reports) {
                if(reports[i][0] == "User "+author+" requested removal") {
                    console.log("       Comment already reported");
                    return;
                }
            }
            if(userScores[offendingUser] > 20000) {
                console.log("       User is approved");

                // report comment instead of removing
                await toRemove.report({reason: "User "+author+" requested removal"});
                // send message to author
                await r.composeMessage({
                    to: author, 
                    subject: "Comment reported",
                    text: "Thank you for helping to keep the subreddit clean! The comment you requested for removal was created by an approved user. Their comment has been reported to the moderators for review.",
                });
                // log removal if author is not the same as the offending user (testing)
                if(author != offendingUser) {
                    if(log[offendingUser] == undefined) {
                        log[offendingUser] = {"requestsMade": 0, "reportsMade": 0, "requestsAgainst": 0, "reportsAgainst": 1};
                    } else {
                        log[offendingUser].reportsAgainst++;
                    }
                    if(log[author] == undefined) {
                        log[author] = {"requestsMade": 0, "reportsMade": 1, "requestsAgainst": 0, "reportsAgainst": 0};
                    } else {
                        log[author].reportsMade++;
                    }
                    await jsonfile.writeFileSync('./log.json', log);
                }
                console.log("       Reported comment");
            } else {

                console.log("   Removing comment");
                await toRemove.remove();
                // check if comment was removed
                toRemove = await r.getComment(comment.parent_id);
                isRemoved = await toRemove.removed;
                if(!isRemoved) {
                    console.log("       Failed");
                    await toRemove.report({reason: "User "+author+" requested removal"});
                    await r.composeMessage({
                        to: author,
                        subject: "Comment reported",
                        text: "Thank you for helping to keep the subreddit clean! For some reason, I was unable to remove the comment. The comment has been reported to the moderators for review.",
                    });
                    if(author != offendingUser) {
                        if(log[offendingUser] == undefined) {
                            log[offendingUser] = {"requestsMade": 0, "reportsMade": 0, "requestsAgainst": 0, "reportsAgainst": 1};
                        } else {
                            log[offendingUser].reportsAgainst++;
                        }
                        if(log[author] == undefined) {
                            log[author] = {"requestsMade": 0, "reportsMade": 1, "requestsAgainst": 0, "reportsAgainst": 0};
                        } else {
                            log[author].reportsMade++;
                        }
                        await jsonfile.writeFileSync('./log.json', log);
                    }
                    console.log("       Reported comment");
                    return;
                } 
                await comment.reply("Thank you for helping to keep the subreddit clean! The comment you reported has been removed.");

                // log removal if author is not the same as the offending user (testing)
                if(author != offendingUser) {
                    if(log[offendingUser] == undefined) {
                        log[offendingUser] = {"requested": 0, "removed": 1};
                    } else {
                        log[offendingUser].removed++;
                    }
                    if(log[author] == undefined) {
                        log[author] = {"requested": 1, "removed": 0};
                    } else {
                        log[author].requested++;
                    }
                    await jsonfile.writeFileSync('./log.json', log);
                }
            }
        } else {
            //console.log("   Top level comment, leaving for automod")
        }
    }
}
