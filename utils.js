function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { log, delay };
