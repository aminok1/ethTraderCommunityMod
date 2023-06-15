const { ethers } = require('ethers');
const { Contract, Provider } = require('ethers-multicall');
const fs = require('fs');
const fetch = require('node-fetch');

// connect to gnosis xdai
var Gprovider = new ethers.providers.JsonRpcProvider('https://rpc.gnosischain.com');
var Eprovider = new ethers.providers.JsonRpcProvider('https://eth.llamarpc.com');

var erc20abi = [{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}];
var uniabi = [{"constant":true,"inputs":[],"name":"getReserves","outputs":[{"internalType":"uint112","name":"_reserve0","type":"uint112"},{"internalType":"uint112","name":"_reserve1","type":"uint112"},{"internalType":"uint32","name":"_blockTimestampLast","type":"uint32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"}];

Gdonuts = "0x524B969793a64a602342d89BC2789D43a016B13A";
Edonuts = "0xC0F9bD5Fa5698B6505F643900FFA515Ea5dF54A9";
Gcontrib = "0xfc24f552fa4f7809a32ce6ee07c09dcd7a41988f";
Estaking = "0x813fd5A7B6f6d792Bf9c03BBF02Ec3F08C9f98B2";
Euniswap = "0x718Dd8B743ea19d71BDb4Cb48BB984b73a65cE06";
Ghoneyswap = "0x077240a400b1740C8cD6f73DEa37DA1F703D8c00";
Gstaking = "0x84b427415a23bfb57eb94a0db6a818eb63e2429d";

GcallProvider = new Provider(Gprovider);
EcallProvider = new Provider(Eprovider);
GdonutContract = new Contract(Gdonuts, erc20abi);
EdonutContract = new Contract(Edonuts, erc20abi);
GcontribContract = new Contract(Gcontrib, erc20abi);
EstakingContract = new Contract(Estaking, erc20abi);
GstakingContract = new Contract(Gstaking, erc20abi);
EuniswapContract = new Contract(Euniswap, uniabi);
GhoneyswapContract = new Contract(Ghoneyswap, uniabi);

// get uniswap LP token donut reserves
async function getSwapData() {
    try {
        // mainnet
        calls = [];
        calls.push(EuniswapContract.getReserves());
        calls.push(EuniswapContract.totalSupply());
        results = await EcallProvider.all(calls);
        ret = [];
        ret.push(Number(ethers.utils.formatEther(results[0][0])));
        ret.push(Number(ethers.utils.formatEther(results[0][1])));
        ret.push(Number(ethers.utils.formatEther(results[1])));
        
        //gnosis
        calls = [];
        calls.push(GhoneyswapContract.getReserves());
        calls.push(GhoneyswapContract.totalSupply());
        results = await GcallProvider.all(calls);

        ret.push(Number(ethers.utils.formatEther(results[0][0])));
        ret.push(Number(ethers.utils.formatEther(results[0][1])));
        ret.push(Number(ethers.utils.formatEther(results[1])));
        
        return ret;

    } catch (e) {
        console.log(e);
    }
    return null;
}


userUrl = "https://raw.githubusercontent.com/EthTrader/donut.distribution/main/docs/users.json";
userFile = "users.json";

// get user addresses from github
async function getAddresses() {
    try {
        users = await fetch("https://raw.githubusercontent.com/EthTrader/donut.distribution/main/docs/users.json", {
            "headers": {
                "content-type": "application/json"
            },
            "method": "GET"
        });
        users = await users.json();
        return users;
    } catch (e) {
        console.log(e);
    }
    return null;
}

async function updateScores() {
    time_start = Date.now();
    await EcallProvider.init();
    await GcallProvider.init();
    swapdata = await getSwapData();

    // calculate donut per LP token (donut reserve / total LP supply)
    mainnetStakeDonut = swapdata[1]/swapdata[2];
    gnosisStakeDonut = swapdata[3]/swapdata[5];

    userList = await getAddresses();
    if(userList == null) {
        console.log("Error getting user list");
        return;
    }
    /*
        [
            {
                username: 'dont_forget_canada',
                address: '0x009af493e9A3a3Ba3DFfBF734E1B2a5B0352dF46',
                contrib: '6846717',
                donut: '348634',
                weight: '348634'
            },
            ...
        ]
    */


    // check user donut and contrib balances using multicall gnosis and mainnet

    console.log("Running calls");
    querySize = 500;
    var groups = Math.floor(Number( (userList.length/querySize) + 1));
    await Promise.all([...Array(Number(groups)).keys()].map(async i => {
        var start = i*querySize;
        var finish = i*querySize + querySize - 1;
        if(finish >= userList.length){
            finish = userList.length - 1;
        }
        console.log("Checking balances from " + start + " to " +finish);
        var Gcalls = [];
        var Ecalls = [];
        for(var index = start; index <= finish; index++){
            Gcalls.push(GdonutContract.balanceOf(userList[index].address));
            Gcalls.push(GcontribContract.balanceOf(userList[index].address));
            Gcalls.push(GstakingContract.balanceOf(userList[index].address));
            Ecalls.push(EdonutContract.balanceOf(userList[index].address));
            Ecalls.push(EstakingContract.balanceOf(userList[index].address));
        }
        results = await GcallProvider.all(Gcalls);
        for(var d = 0; d < results.length; d += 3){
            userList[start + (d/3)].donut = Number(ethers.utils.formatEther(results[d]));
            userList[start + (d/3)].contrib = Number(ethers.utils.formatEther(results[d+1]));
            userList[start + (d/3)].donut += Number(ethers.utils.formatEther(results[d+2]))*gnosisStakeDonut;
        }
        results = await EcallProvider.all(Ecalls);
        for(var d = 0; d < results.length; d += 2){
            userList[start + (d/2)].donut += Number(ethers.utils.formatEther(results[d]));
            userList[start + (d/2)].donut += Number(ethers.utils.formatEther(results[d+1]))*mainnetStakeDonut;
            userList[start + (d/2)].donut < userList[start + (d/2)].contrib ? userList[start + (d/2)].weight = userList[start + (d/2)].donut : userList[start + (d/2)].weight = userList[start + (d/2)].contrib;
        }
    }));

    time_end = Date.now();
    console.log("Time taken: "+(time_end - time_start)+"ms");
    // write to file
    fs.writeFileSync(userFile, JSON.stringify(userList, null, 4));
}

updateScores();
