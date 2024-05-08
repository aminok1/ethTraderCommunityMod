const scores = require('./src/scores');
const jsonfile = require('jsonfile');

async function updateUsers() {
    console.log("Updating user scores");
    await scores.update();
    await jsonfile.readFileSync('./users.json');
}
updateUsers();