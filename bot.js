const TronWeb = require("tronweb");
const fs = require("fs");
const bip39 = require("bip39");
const hdkey = require("hdkey");
const dotenv = require("dotenv");
const readline = require("readline");

dotenv.config();

//////////////////////////////////////////////////////
// RPC LIST
//////////////////////////////////////////////////////

const RPC_LIST = [
 process.env.RPC_URL || "https://tron.api.pocket.network",
 "https://api.trongrid.io",
 "https://tron-rpc.publicnode.com",
 "https://rpc.ankr.com/tron",
 "https://tron-mainnet.public.blastapi.io"
];

let currentRPC = 0;

let tronWeb = new TronWeb({
 fullHost: RPC_LIST[currentRPC],
 headers: {
  "TRON-PRO-API-KEY": process.env.TRON_API_KEY
 }
});

function switchRPC() {

 currentRPC++;

 if (currentRPC >= RPC_LIST.length) {
  currentRPC = 0;
 }

 console.log("Switch RPC ->", RPC_LIST[currentRPC]);

 tronWeb = new TronWeb({
  fullHost: RPC_LIST[currentRPC],
  headers: {
   "TRON-PRO-API-KEY": process.env.TRON_API_KEY
  }
 });

}

//////////////////////////////////////////////////////
// CLI INPUT
//////////////////////////////////////////////////////

const rl = readline.createInterface({
 input: process.stdin,
 output: process.stdout
});

function ask(q) {
 return new Promise(resolve => rl.question(q, resolve));
}

function sleep(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
}

//////////////////////////////////////////////////////
// GENERATE WALLET
//////////////////////////////////////////////////////

function generateAccountsFromMnemonic(mnemonic, count = 10) {

 const seed = bip39.mnemonicToSeedSync(mnemonic);

 const root = hdkey.fromMasterSeed(seed);

 const privateKeys = [];

 for (let i = 0; i < count; i++) {

  const child = root.derive(`m/44'/195'/0'/0/${i}`);

  privateKeys.push(child.privateKey.toString("hex"));

 }

 return privateKeys;

}

//////////////////////////////////////////////////////
// SAVE WALLET
//////////////////////////////////////////////////////

function saveAddresses(privateKeys) {

 fs.writeFileSync("accounts.txt", privateKeys.join("\n"));

 const addresses = privateKeys.map(pk =>
  tronWeb.address.fromPrivateKey(pk)
 );

 fs.writeFileSync("address.txt", addresses.join("\n"));

}

//////////////////////////////////////////////////////
// GET BALANCE
//////////////////////////////////////////////////////

async function getBalance(address) {

 try {

  await sleep(500);

  return await tronWeb.trx.getBalance(address);

 } catch (err) {

  console.log("RPC error, mencoba node lain...");

  switchRPC();

  await sleep(2000);

  return await tronWeb.trx.getBalance(address);

 }

}

//////////////////////////////////////////////////////
// GET BANDWIDTH (FIXED)
//////////////////////////////////////////////////////

async function getBandwidth(address) {

 try {

  const res = await tronWeb.trx.getAccountResources(address);

  const free = res.freeNetLimit - res.freeNetUsed;

  return free;

 } catch (err) {

  return 0;

 }

}

//////////////////////////////////////////////////////
// SEND TRANSACTION
//////////////////////////////////////////////////////

async function sendTransaction(privateKey, toAddress) {

 try {

  const address = tronWeb.address.fromPrivateKey(privateKey);

  await sleep(500);

  const balance = await getBalance(address);

  const bandwidth = await getBandwidth(address);

  const trxBalance = balance / 1e6;

  console.log(`Saldo ${address}: ${trxBalance} TRX`);
  console.log(`Bandwidth: ${bandwidth}`);

  if (balance === 0) {

   console.log("Saldo kosong, skip\n");

   return;

  }

  const estimatedFee = 1000000;

  let amount = balance - estimatedFee;

  if (amount <= 0) {

   console.log("Saldo tidak cukup untuk fee\n");

   return;

  }

  if (bandwidth < 300) {

   console.log("Bandwidth tidak cukup\n");

   return;

  }

  const txn = await tronWeb.transactionBuilder.sendTrx(
   toAddress,
   amount,
   address
  );

  const signed = await tronWeb.trx.sign(txn, privateKey);

  const result = await tronWeb.trx.sendRawTransaction(signed);

  console.log("Response RPC:", result);

  if (result.result) {

   console.log("✅ Berhasil kirim");
   console.log("TXID:", result.txid);

  } else {

   console.log("❌ Transaksi gagal");

  }

  console.log("");

 } catch (err) {

  console.log("Error transaksi:");

  if (err.response) {

   console.log(err.response.data);

  } else {

   console.log(err);

  }

  if (err.toString().includes("rate")) {

   console.log("Rate limit terkena, tunggu 10 detik...");

   await sleep(10000);

  }

  switchRPC();

 }

}

//////////////////////////////////////////////////////
// MAIN
//////////////////////////////////////////////////////

async function main() {

 console.log("\n=== TRON Wallet Generator & Sweeper ===\n");

 const phrase = await ask("Paste seed phrase: ");

 if (!bip39.validateMnemonic(phrase)) {

  console.log("Seed phrase tidak valid");

  process.exit();

 }

 const count = parseInt(
  await ask("Jumlah wallet yang digenerate: "),
  10
 );

 if (isNaN(count) || count <= 0) {

  console.log("Jumlah wallet tidak valid");

  process.exit();

 }

 const privateKeys = generateAccountsFromMnemonic(phrase, count);

 console.log(`\nBerhasil generate ${privateKeys.length} wallet`);

 saveAddresses(privateKeys);

 console.log("Private key -> accounts.txt");
 console.log("Address -> address.txt");

 const toAddress = await ask("\nMasukkan address penerima: ");

 if (!tronWeb.isAddress(toAddress)) {

  console.log("Address tidak valid");

  process.exit();

 }

 console.log("\nMulai kirim saldo...\n");

 for (let i = 0; i < privateKeys.length; i++) {

  console.log(`Akun ${i + 1}`);

  await sendTransaction(privateKeys[i], toAddress);

  await sleep(5000);

 }

 rl.close();

}

main();
