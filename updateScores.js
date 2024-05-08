const scores = require('./src/scores');
const fetch = require('node-fetch'); // Import node-fetch to make HTTP requests

async function updateUsers() {
    console.log("Updating user scores");
    await scores.update();

    // Fetch the user data from the remote JSON file
    try {
        const response = await fetch('https://raw.githubusercontent.com/EthTrader/donut.distribution/main/docs/users.json');
        if (!response.ok) {
            throw new Error('Failed to fetch user data: ' + response.status);
        }
        const users = await response.json();
        console.log(users); // Output the user data or use it as needed
    } catch (error) {
        console.error("Error fetching user data:", error);
    }
}

updateUsers();
