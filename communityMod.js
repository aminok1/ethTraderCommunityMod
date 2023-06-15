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

phrase = "[automodremove]"

// check if cli argument is "--reset"
if(process.argv[2] == "--reset") {
    cache.seenIds = [];
    jsonfile.writeFileSync('./cache.json', cache);
    console.log("Cache reset");
}

async function main() {
    
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
        await subreddit.getNewComments(params).then(function(comments) {
            // reverse comments so we can start from the oldest
            comments.reverse();
            for(c in comments) {
                comment = comments[c];
                if(comment == undefined) continue;
                if(comment.body == undefined) continue;
                foundComment = 1;
                // check if we've already seen this comment
                if(cache.seenIds.indexOf(comment.name) === -1) {
                    if(comment.body.trim().toLowerCase().indexOf(phrase) === 0) {
                        handleReport(comment);
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
    if(newSeens) {
        jsonfile.writeFileSync('./cache.json', cache);
    }
}

updateUsers();
main();
// run main function every 60 seconds
setInterval(main, 60000);
// update users every 24 hours
setInterval(updateUsers, 86400000);


async function handleReport(comment) {
    author = await comment.author.name;
    console.log("Found removal request from user "+author+" on item "+comment.link_id+" "+comment.parent_id);
    console.log(comment.body)
    if(userScores[author] == undefined) {
        console.log("User does not have enough voting power");
    } else if(userScores[author] > 20000) {
        console.log("User has enough voting power");
        if(comment.link_id != comment.parent_id) {
            console.log("Removing comment");
            toRemove = await r.getComment(comment.parent_id);
            offendingUser = await toRemove.author.name;
            await toRemove.remove({spam: true});
            // reply to user
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
        } else {
            console.log("Top level comment, leaving for automod")
        }
    }
}
