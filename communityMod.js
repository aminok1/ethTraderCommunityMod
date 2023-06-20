// reddit bot for r/ethtrader

var snoowrap = require('snoowrap');
const jsonfile = require('jsonfile');
var client = jsonfile.readFileSync('./.client');
var cache = require('./cache.json');
var log = require('./log.json');
const scores = require('./src/scores');
var users = require('./users.json');

async function updateUsers() {
    console.log("Updating user scores");
    await scores.update();
    users = await jsonfile.readFileSync('./users.json');
}

userScores = {};
users.forEach(function(user) {
    userScores[user.username] = user.weight;
});

var r = new snoowrap({
    userAgent: client.userAgent,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    username: client.username,
    password: client.password
});

var subreddit = r.getSubreddit('EthTrader_Test');

// sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

phrase = "[automodremove"

// check if cli argument is "--reset"
if(process.argv[2] == "--reset" || process.argv[3] == "--reset") {
    cache.seenIds = [];
    jsonfile.writeFileSync('./cache.json', cache);
    console.log("Cache reset");
}

async function main() {
    try {
    
        foundLast = 0;
        foundNewest = 0;
        runOnce = 0;
        newSeens = 0;


        if(cache.seenIds == undefined) {
            cache.seenIds = [];
        }
        if(cache.seenIds.length == 0) {
            params = {limit: 100};
            runOnce = 1;
        } else {
            params = {limit: 20, before:cache.seenIds[cache.seenIds.length-1]};
        }

        while(foundLast == 0 && foundNewest == 0) {
            timeString = new Date().toLocaleTimeString();
            console.log("Checking for new comments "+timeString)
            foundComment = 0;
            await subreddit.getNewComments(params).then( async function(comments) {
                // reverse comments so we can start from the oldest
                comments.reverse();
                for(c in comments) {
                    comment = comments[c];
                    if(comment == undefined) continue;
                    if(comment.body == undefined) continue;
                    foundComment = 1;
                    // check if we've already seen this comment
                    if(cache.seenIds.indexOf(comment.name) === -1) {
                        if(comment.body.trim().toLowerCase().indexOf(phrase) === 0 || comment.body.trim().toLowerCase().indexOf(phrase) === 1) {
                            await handleReport(comment);
                        }
                        cache.seenIds.push(comment.name);
                        newSeens = 1;
                    } else {
                        foundLast = 1;
                        break;
                    }
                }
            });
            if(!foundComment || runOnce) {
                foundNewest = 1;
            } else {
                await sleep(500); // being nice to apis
            }
        }
    } catch(err) {
        console.log(err);
    }
    if(newSeens) {
        jsonfile.writeFileSync('./cache.json', cache);
    }
}

async function firstRun() {
    // check if first or second arg is "--skip"
    if(process.argv[2] == "--skip" || process.argv[3] == "--skip") {
        await main();
        return;
    }
    await updateUsers();
    await main();
}

firstRun();

// run main function every 60 seconds
setInterval(main, 60000);
// update users every 24 hours
setInterval(updateUsers, 86400000);


async function handleReport(comment) {
    //console.log(comment);
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
                        to: "-0-O-", // testing
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
