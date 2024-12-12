require('dotenv').config();
const { fetchTrendingTokens, limitedApiCall } = require('./fetchTokens');
// const { buyToken, sellToken } = require('./trade');
const { isTokenScam } = require('./scamDetection');
const { delay, log } = require('./utils');
const axios = require('axios');

const MAX_HOLD_TIME = parseInt(process.env.MAX_HOLD_TIME, 10);

async function main() {
    log("Starting Memecoin Trading Bot...");

    while (true) {
        try {
            const tokens = await limitedApiCall(fetchTrendingTokens);

            if (tokens.length === 0) {
                log("No tokens matched the criteria. Waiting for the next check...");
                await delay(30000); // Wait for 30 seconds before checking again
                continue;
            }

            await Promise.all(tokens.map(async (token) => {
            
                if (await isTokenScam(token.tokenAddress)) {
                    log(`Skipping potential scam token: ${token.name}`);
                    return;
                }

                try {
                    console.log("Active geniune looking tokens::\n", tokens)
                
                } catch (error) {
                    log(`Error processing token ${token.name}: ${error.message}`);
                }
            }));
        } catch (error) {
            log(`Error in main loop: ${error.message}`);
        }

        // Delay between monitoring iterations
        await delay(30000); // Adjust as needed
    }
}

main()