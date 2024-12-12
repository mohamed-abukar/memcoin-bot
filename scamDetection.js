const { Connection, PublicKey } = require("@solana/web3.js");
const axios = require('axios');

const { Radium, getTokenAccountsByOwner } = require("@raydium-io/raydium-sdk-v2");
// Raydium Program IDs and connection setup
const RAYDIUM_PROGRAM_AMM = process.env.RAYDIUM_PROGRAM_AMM || "RVKd61ztZW9wrJ2e7aJMgDo8m8FZPq8TVDajdKD4zjv"
const RAYDIUM_PAIRS_API = process.env.RAYDIUM_PAIRS_API || "https://api.raydium.io/v2/pairs?token_mint"

const RAYDIUM_PROGRAM_ID = new PublicKey(RAYDIUM_PROGRAM_AMM); // Raydium AMM
const connection = new Connection(process.env.RPC_URL, "confirmed");

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function limitedRequest(apiCall, delay = 1000) {
    // Add delay before making the next request
    await sleep(delay);
    return apiCall();
}

/**
 * Check if a token is potentially a scam
 * @param {string} tokenMintAddress - The mint address of the token
 * @returns {Promise<boolean>} - Returns true if the token is a scam, false otherwise
 */
async function isTokenScam(tokenMintAddress) {
    const tokenMint = new PublicKey(tokenMintAddress);

    try {
        // Fetch token supply
        const tokenSupply = await connection.getTokenSupply(tokenMint);

        // const tokenSupply = await limitedRequest(() => connection.getTokenSupply(tokenMint), 2000); // Delay of 2 seconds
        const totalSupply = parseFloat(tokenSupply.value.uiAmountString);

        // Criteria 1: Total supply check
        if (totalSupply < 100 || totalSupply > 1e15) {
            console.log(`Scam suspicion: Total supply (${totalSupply}) is unusual`);
            return true;
        }

        // Criteria 2: Largest account ownership check
        // const largestAccounts = await connection.getTokenLargestAccounts(tokenMint, "confirmed");
        // // const largestAccounts = await fetchLargestTokenAccounts(tokenMint)
        // // const largestAccounts = await limitedRequest(() => connection.getTokenLargestAccounts(tokenMint), 2000); // Delay of 2 seconds
        // if(largestAccounts === null) {
        //     console.log(`Scam suspicion: A single account owns ${largestAccountBalance / totalSupply * 100}% of the supply`);
        //     return true;
        // }
        // const accounts = largestAccounts.value;
        // const largestAccountBalance = accounts[0]?.uiAmount || 0;
        // if (largestAccountBalance / totalSupply > 0.9) {
        //     console.log(`Scam suspicion: A single account owns ${largestAccountBalance / totalSupply * 100}% of the supply`);
        //     return true;
        // }

        // Criteria 3: Pool liquidity check using Raydium
        const liquidity = await checkLiquidity(tokenMint);
        if (liquidity < 10) {
            console.log("Scam suspicion: Low or zero liquidity in associated pool");
            return true;
        }

        // Criteria 4: Holders count check
        const holdersCount = await getHoldersCount(tokenMint);
        if (holdersCount < 50) {
            console.log(`Scam suspicion: Few holders (${holdersCount})`);
            return true;
        }

        // All checks passed, token is not a scam
        console.log("Token appears safe for trading");
        return false;
    } catch (error) {
        console.error(`Error checking token scam status: ${error.message}`);
        // Default to assuming it's unsafe if verification fails
        return true;
    }
}

/**
 * Check liquidity in Raydium pools for a given token
 * @param {PublicKey} tokenMint - The mint address of the token
 * @returns {Promise<number>} - Returns liquidity in SOL or equivalent token units
 */
async function checkLiquidity(tokenMint) {
    try {
        // Fetch Raydium pool accounts
        const pools = await getTokenAccountsByOwner({
            connection,
            owner: RAYDIUM_PROGRAM_ID,
            mint: tokenMint,
        });

        if (pools.length === 0) {
            console.log("No liquidity pool found for this token.");
            return 0;
        }

        // Calculate liquidity from the pool accounts
        let liquidity = 0;
        for (const pool of pools) {
            const balance = await connection.getTokenAccountBalance(pool.publicKey);
            liquidity += parseFloat(balance.value.uiAmount || "0");
        }

        console.log(`Total liquidity: ${liquidity} units`);
        return liquidity;
    } catch (error) {
        console.error(`Error checking liquidity: ${error.message}`);
        return 0; // Default to no liquidity
    }
}

/**
 * Fetch Raydium pool information for a specific token
 * @param {PublicKey} tokenMint - The mint address of the token
 * @returns {Promise<Object>} - Returns the pool information
 */
async function fetchRaydiumPoolInfo(tokenMint) {
    try {
        const pools = await getPools(tokenMint);//{ connection }
        // Filter pools for the specific token
        const pool = Object.values(pools).find(
            (pool) =>
                pool.mintA.equals(tokenMint) || pool.mintB.equals(tokenMint)
        );

        if (!pool) {
            console.log("No pool found for the specified token.");
            return null;
        }

        console.log("Pool found:", pool);
        return pool;
    } catch (error) {
        console.error("Error fetching pool info:", error.message);
        return null;
    }
}

/**
 * Get the largest accounts holding a specific token in Raydium pools
 * @param {PublicKey} tokenMint - The mint address of the token
 * @returns {Promise<Object>} - Returns the largest account information
 */
async function fetchLargestTokenAccounts(tokenMint) {
    try {
        const pool = await fetchRaydiumPoolInfo(tokenMint);
        if (!pool) return null;

        // Fetch token accounts by owner
        const accounts = await getTokenAccountsByOwner({
            connection,
            owner: pool.id, // Pool ID is the owner of token accounts
            mint: tokenMint,
        });

        if (accounts.length === 0) {
            console.log("No accounts found for this token in the pool.");
            return null;
        }

        // Sort accounts by balance to find the largest
        const sortedAccounts = accounts.sort(
            (a, b) => b.uiAmount - a.uiAmount
        );

        const largestAccount = sortedAccounts[0];
        console.log("Largest token account:", largestAccount);
        return largestAccount;
    } catch (error) {
        console.error("Error fetching largest token accounts:", error.message);
        return null;
    }
}




/**
 * Get the number of unique holders of a token
 * @param {PublicKey} tokenMint - The mint address of the token
 * @returns {Promise<number>} - Returns the number of unique holders
 */
async function getHoldersCount(tokenMint) {
    try {
        // Fetch all accounts for the token mint
        const accounts = await connection.getTokenAccountsByMint(tokenMint);

        // Count unique owners
        const uniqueHolders = new Set(
            accounts.value.map((account) => account.pubkey.toString())
        );

        console.log(`Unique holders count: ${uniqueHolders.size}`);
        return uniqueHolders.size;
    } catch (error) {
        console.error(`Error fetching holders count: ${error.message}`);
        return 0; // Default to no holders
    }
}
async function getPools(tokenMintAddress) {
    try {
        const response = await axios.get(
            RAYDIUM_PAIRS_API+`=${tokenMintAddress}`
        );

        const pools = response.data;
        if (!pools || pools.length === 0) {
            console.log(`No pools found for token: ${tokenMintAddress}`);
            return [];
        }

        console.log(`Found ${pools.length} pools for token: ${tokenMintAddress}`);
        return pools;
    } catch (error) {
        console.error(`Error fetching pools for token ${tokenMintAddress}: ${error.message}`);
        return [];
    }
}
// async function getPools(tokenMintAddress) {
//     try {
//         const tokenMint = new PublicKey(tokenMintAddress);

//         // Fetch Raydium pools using the SDK
//         const pools = await Radium.getTokenAccountsByOwner({
//             connection,
//             owner: RAYDIUM_PROGRAM_ID,
//             mint: tokenMint,
//         });

//         if (pools.length === 0) {
//             console.log(`No liquidity pools found for token: ${tokenMintAddress}`);
//             return [];
//         }

//         // Format pool data for easier handling
//         const poolData = await Promise.all(
//             pools.map(async (pool) => {
//                 const balance = await connection.getTokenAccountBalance(pool.publicKey);
//                 return {
//                     poolAddress: pool.publicKey.toString(),
//                     liquidity: parseFloat(balance.value.uiAmount || "0"),
//                 };
//             })
//         );

//         console.log(`Found ${poolData.length} pools for token: ${tokenMintAddress}`);
//         return poolData;
//     } catch (error) {
//         console.error(`Error fetching pools for token ${tokenMintAddress}: ${error.message}`);
//         return [];
//     }
// }
module.exports = { isTokenScam };



// // const { PublicKey } = require("@solana/web3.js");
// const { Connection, PublicKey } = require("@solana/web3.js");

// /**
//  * Check if a token is potentially a scam
//  * @param {string} tokenMintAddress - The mint address of the token
//  * @returns {Promise<boolean>} - Returns true if the token is a scam, false otherwise
//  */
// async function isTokenScam(tokenMintAddress) {
//     const tokenMint = new PublicKey(tokenMintAddress);

//     try {
//         // Fetch token supply
//         const tokenSupply = await connection.getTokenSupply(tokenMint);
//         const totalSupply = parseFloat(tokenSupply.value.uiAmountString);

//         // Criteria 1: Total supply check
//         if (totalSupply < 100 || totalSupply > 1e15) {
//             console.log(`Scam suspicion: Total supply (${totalSupply}) is unusual`);
//             return true;
//         }

//         // Criteria 2: Largest account ownership check
//         const largestAccounts = await connection.getTokenLargestAccounts(tokenMint);
//         const accounts = largestAccounts.value;
//         const largestAccountBalance = accounts[0]?.uiAmount || 0;
//         if (largestAccountBalance / totalSupply > 0.9) {
//             console.log(`Scam suspicion: A single account owns ${largestAccountBalance / totalSupply * 100}% of the supply`);
//             return true;
//         }

//         // Criteria 3: Pool liquidity check using Raydium
//         const liquidity = await checkLiquidity(tokenMint);
//         if (liquidity < 10) {
//             console.log("Scam suspicion: Low or zero liquidity in associated pool");
//             return true;
//         }

//         // Criteria 4: Holders count check
//         const holdersCount = Radium.getHoldersCount(tokenMint)//await getHoldersCount(tokenMint);
//         if (holdersCount < 50) {
//             console.log(`Scam suspicion: Few holders (${holdersCount})`);
//             return true;
//         }

//         // All checks passed, token is not a scam
//         console.log("Token appears safe for trading");
//         return false;
//     } catch (error) {
//         console.error(`Error checking token scam status: ${error.message}`);
//         // Default to assuming it's unsafe if verification fails
//         return true;
//     }
// }
// // const { getTokenAccountsByOwner } = require("raydium-sdk");
// const {Radium} = require("@raydium-io/raydium-sdk-v2");
// // Raydium Program IDs and connection setup
// const RAYDIUM_PROGRAM_ID = new PublicKey("RVKd61ztZW9wrJ2e7aJMgDo8m8FZPq8TVDajdKD4zjv"); // Raydium AMM
// const connection = new Connection(process.env.RPC_URL, "confirmed");
// /**
//  * Check liquidity in Raydium pools for a given token
//  * @param {PublicKey} tokenMint - The mint address of the token
//  * @returns {Promise<number>} - Returns liquidity in SOL or equivalent token units
//  */
// async function checkLiquidity(tokenMint) {
//     try {
//         // Fetch Raydium pool accounts
//         const pools = await Radium.getTokenAccountsByOwner({
//             connection,
//             owner: RAYDIUM_PROGRAM_ID,
//             mint: tokenMint,
//         });

//         if (pools.length === 0) {
//             console.log("No liquidity pool found for this token.");
//             return 0;
//         }

//         // Calculate liquidity from the pool accounts
//         let liquidity = 0;
//         for (const pool of pools) {
//             const balance = await connection.getTokenAccountBalance(pool.publicKey);
//             liquidity += parseFloat(balance.value.uiAmount || "0");
//         }

//         console.log(`Total liquidity: ${liquidity} units`);
//         return liquidity;
//     } catch (error) {
//         console.error(`Error checking liquidity: ${error.message}`);
//         return 0; // Default to no liquidity
//     }
// }

// /**
//  * Get the number of unique holders of a token
//  * @param {PublicKey} tokenMint - The mint address of the token
//  * @returns {Promise<number>} - Returns the number of unique holders
//  */
// async function getHoldersCount(tokenMint) {
//     try {
//         // Fetch all accounts for the token mint
//         const accounts = await connection.getTokenAccountsByMint(tokenMint);

//         // Count unique owners
//         const uniqueHolders = new Set(
//             accounts.value.map((account) => account.pubkey.toString())
//         );

//         console.log(`Unique holders count: ${uniqueHolders.size}`);
//         return uniqueHolders.size;
//     } catch (error) {
//         console.error(`Error fetching holders count: ${error.message}`);
//         return 0; // Default to no holders
//     }
// }



// module.exports = { isTokenScam };
